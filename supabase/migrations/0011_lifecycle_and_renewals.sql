-- =============================================================================
-- 0011 — Advertisement lifecycle, expiry and renewal
--
-- The states are the ones that already exist. "Published" is not a new status:
-- it is `approved` with a `published_at`, and it is public for exactly as long
-- as `expires_at` is in the future — `public_ads` has said so since 0007. What
-- this migration adds is the rest of the life of an advertisement:
--
--   * how long a run lasts, per package, in one place (`packages.duration_days`,
--     falling back to `ads.default_duration_days`);
--   * the expiry sweep, idempotent and safe to call from any scheduler;
--   * renewal as a request that goes back through the office — never a
--     self-service republish — with its own history table;
--   * two administrator overrides, "extend" and "mark as expired", each of
--     which requires a reason and is written to the audit trail;
--   * lifecycle event names on the audit entries, so the history reads as
--     "expired automatically" rather than "moved from approved to expired".
--
-- Nothing is deleted at any point. An expired advertisement keeps its row, its
-- reference, its photographs and every audit entry it ever had.
-- =============================================================================

-- ------------------------------------------------------------ settings ------
insert into public.app_settings (key, value, description) values
  ('ads.expiring_soon_days', '7'::jsonb,
   'How many days before its expiry an advertisement counts as expiring soon, and can be renewed early.'),
  ('ads.max_extension_days', '365'::jsonb,
   'The furthest ahead an administrator may move an expiry date, counted from today.')
on conflict (key) do update
  set description = excluded.description, updated_at = now();

-- ------------------------------------------------------------ packages ------
/*
 * The package table is the configuration. `duration_days` already exists and
 * stays NULL until the office decides otherwise — NULL means "the default run
 * in app_settings", so no length is invented here. `priority` is added so the
 * next phase has somewhere to put listing precedence; nothing reads it yet.
 */
alter table public.packages
  add column if not exists priority smallint not null default 0
  check (priority between 0 and 100);

comment on column public.packages.duration_days is
  'Length of one run in days. NULL uses the ads.default_duration_days setting.';
comment on column public.packages.priority is
  'Listing precedence for the paid-package phase. Not yet used for ordering.';

create or replace function public.package_duration_days(p_package_id text)
returns int
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select duration_days from public.packages where id = p_package_id),
    public.setting_int('ads.default_duration_days', 30)
  );
$$;

comment on function public.package_duration_days(text) is
  'The one place a run length is decided: the package''s own duration, or the site default.';

-- ------------------------------------------------------------ renewals ------
do $$ begin
  create type public.renewal_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

create table if not exists public.ad_renewals (
  id                    uuid primary key default gen_random_uuid(),
  ad_id                 uuid not null references public.ads (id) on delete cascade,
  user_id               uuid not null references public.profiles (id) on delete cascade,
  renewal_number        integer not null check (renewal_number > 0),
  package_id            text not null references public.packages (id),
  -- 'early': asked for while still live, in the expiring-soon window; the
  -- advertisement stays up while the office looks. 'after_expiry': asked for
  -- once finished; the advertisement goes back to the queue.
  timing                text not null check (timing in ('early', 'after_expiry')),
  previous_published_at timestamptz,
  previous_expires_at   timestamptz,
  status                public.renewal_status not null default 'pending',
  requested_at          timestamptz not null default now(),
  decided_at            timestamptz,
  -- Not a foreign key, for the same reason as ad_reports.reviewed_by: deleting
  -- a moderator's account must not rewrite or break the history they made.
  decided_by            uuid,
  decision_note         text check (decision_note is null or char_length(decision_note) <= 500),
  new_published_at      timestamptz,
  new_expires_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint ad_renewals_number_unique unique (ad_id, renewal_number),
  constraint ad_renewals_decided_together check ((status = 'pending') = (decided_at is null)),
  constraint ad_renewals_approved_has_window check (status <> 'approved' or new_expires_at is not null)
);

comment on table public.ad_renewals is
  'Every renewal ever asked for, and what became of it. Written only by the lifecycle functions; the advertiser and the office read it.';

-- One open request per advertisement. The function says so politely; this
-- makes it true under concurrency.
create unique index if not exists ad_renewals_one_pending
  on public.ad_renewals (ad_id) where status = 'pending';
create index if not exists ad_renewals_queue_idx
  on public.ad_renewals (status, requested_at);

drop trigger if exists ad_renewals_set_updated_at on public.ad_renewals;
create trigger ad_renewals_set_updated_at
  before update on public.ad_renewals
  for each row execute function public.set_updated_at();

alter table public.ad_renewals enable row level security;

drop policy if exists ad_renewals_select on public.ad_renewals;
create policy ad_renewals_select on public.ad_renewals
  for select using (user_id = auth.uid() or public.is_staff());

-- Read-only from outside. Every write is one of the functions below, which is
-- where "is this yours", "is it due" and "has it already been asked" live.
revoke all on public.ad_renewals from anon, authenticated;
grant select on public.ad_renewals to authenticated;

-- ------------------------------------------------------------- indexes ------
-- The review queues filter on status and order by submission time.
create index if not exists ads_status_created_idx on public.ads (status, created_at);
-- The public listing's default order. `ads_expiry_idx` (0001) already covers
-- the expiry sweep and the "expiring soon" window, `ads_user_idx` the owner's
-- list and `ads_category_idx` the category pages.
create index if not exists ads_live_published_idx
  on public.ads (published_at desc) where status = 'approved';

-- ------------------------------------------------ publication stamping ------
/*
 * Approval issues a run.
 *
 * A first approval, or an approval after the previous run has ended, sets
 * `published_at` to now and `expires_at` to now plus the package's duration.
 * An approval within a run that is still going (an advertisement unpublished
 * and restored the same week) keeps the window it had — restoring is not a
 * renewal.
 */
create or replace function public.stamp_ad_publication()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    if new.expires_at is null or new.expires_at <= now() then
      new.published_at := now();
      new.expires_at   := now() + make_interval(days => public.package_duration_days(new.package_id));
    else
      new.published_at := coalesce(new.published_at, now());
    end if;
    new.rejection_reason := null;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------- the guard ------
/*
 * As 0009, with one addition: `request_renewal()` may move its caller's own
 * expired advertisement back to the queue, and change its package, while it
 * runs. It says so with a transaction-local marker naming the advertisement;
 * nothing else sets that marker, and PostgREST gives a client no way to.
 */
create or replace function public.guard_ad_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  counting_view boolean := coalesce(current_setting('shree.counting_view', true), '') = '1';
  renewing      boolean := tg_op = 'UPDATE'
                           and coalesce(current_setting('shree.owner_renewal', true), '') = old.id::text;
  staff         boolean := public.is_staff();
begin
  if public.is_trusted_connection() then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and not public.is_permitted_ad_transition(old.status, new.status) then
    raise exception 'An advertisement cannot go from % to %', old.status, new.status
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'UPDATE'
     and old.status in ('rejected', 'changes_requested')
     and new.status is distinct from old.status
     and new.rejection_reason is not distinct from old.rejection_reason then
    new.rejection_reason := null;
  end if;

  if staff then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending') then
      raise exception 'A new advertisement may only be saved as a draft or submitted for review'
        using errcode = 'insufficient_privilege';
    end if;
    if new.is_featured then
      raise exception 'Featured placement is assigned by Shree Classified'
        using errcode = 'insufficient_privilege';
    end if;
    new.published_at := null;
    new.expires_at   := null;
    new.view_count   := 0;
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'An advertisement cannot be transferred to another user'
      using errcode = 'insufficient_privilege';
  end if;
  if new.is_featured is distinct from old.is_featured
     or new.featured_until is distinct from old.featured_until then
    raise exception 'Featured placement is assigned by Shree Classified'
      using errcode = 'insufficient_privilege';
  end if;

  new.reference := old.reference;
  new.slug      := old.slug;
  new.kind      := old.kind;

  -- The run is the database's to set. Always.
  new.published_at         := old.published_at;
  new.expires_at           := old.expires_at;
  new.package_price_paise  := old.package_price_paise;
  if not counting_view then
    new.view_count := old.view_count;
  elsif new.view_count is distinct from old.view_count + 1 then
    new.view_count := old.view_count;
  end if;

  -- A renewal request, and only that: back to the queue with the package the
  -- advertiser chose. Nothing else about the row may change on the way.
  if renewing and old.status = 'expired' and new.status = 'pending' then
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.price is distinct from old.price
       or new.category_id is distinct from old.category_id
       or new.location_id is distinct from old.location_id
       or new.attributes is distinct from old.attributes then
      raise exception 'A renewal does not change the advertisement'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.package_id is distinct from old.package_id then
    raise exception 'The package is set when the advertisement is taken'
      using errcode = 'insufficient_privilege';
  end if;

  if old.status in ('expired', 'sold') and new.status is distinct from old.status then
    raise exception 'A finished advertisement is renewed through a renewal request'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status is distinct from old.status
     and new.status not in ('draft', 'pending', 'sold')
     and not (new.status = 'expired'
              and old.expires_at is not null
              and old.expires_at <= now()) then
    raise exception 'Only Shree Classified staff can set an advertisement to %', new.status
      using errcode = 'insufficient_privilege';
  end if;

  if old.status = 'approved'
     and new.status = 'approved'
     and (new.title is distinct from old.title
          or new.description is distinct from old.description
          or new.price is distinct from old.price
          or new.category_id is distinct from old.category_id
          or new.attributes is distinct from old.attributes) then
    new.status := 'pending';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------- audit entries ------
/*
 * As 0010, plus the lifecycle event and the run dates on every status change.
 * The event is named by whichever function made the change (through a
 * transaction-local setting); a bare UPDATE gets a name derived from the move.
 */
create or replace function public.audit_ad_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  note  text := nullif(current_setting('shree.moderation_note', true), '');
  event text := nullif(current_setting('shree.lifecycle_event', true), '');
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(
      'ad.created', 'advertisement', new.id,
      format('%s %s', new.reference,
             case when new.status = 'draft' then 'saved as a draft' else 'submitted' end),
      null,
      jsonb_build_object('status', new.status, 'kind', new.kind, 'reference', new.reference,
                         'event', case when new.status = 'draft' then 'created' else 'submitted' end));
    return new;
  end if;

  if new.status is distinct from old.status then
    event := coalesce(event, case
      when new.status = 'pending' and old.status = 'draft'             then 'submitted'
      when new.status = 'pending' and old.status in ('rejected', 'changes_requested') then 'resubmitted'
      when new.status = 'pending' and old.status = 'approved'          then 'unpublished'
      when new.status = 'pending'                                      then 'restored'
      when new.status = 'approved' and old.expires_at is not null
           and old.expires_at <= now()                                 then 'republished'
      when new.status = 'approved'                                     then 'published'
      when new.status = 'rejected'                                     then 'rejected'
      when new.status = 'changes_requested'                            then 'changes_requested'
      when new.status = 'expired' and auth.uid() is null               then 'expired_automatically'
      when new.status = 'expired'                                      then 'expired'
      when new.status = 'sold'                                         then 'marked_sold'
      when new.status = 'draft'                                        then 'withdrawn'
      else 'status_changed'
    end);

    perform public.write_audit(
      'ad.status_changed', 'advertisement', new.id,
      coalesce(note, format('%s moved from %s to %s', new.reference, old.status, new.status)),
      jsonb_build_object('status', old.status, 'rejection_reason', old.rejection_reason,
                         'published_at', old.published_at, 'expires_at', old.expires_at),
      jsonb_build_object(
        'status', new.status,
        'rejection_reason', new.rejection_reason,
        'published_at', new.published_at,
        'expires_at', new.expires_at,
        'package_id', new.package_id,
        'reference', new.reference,
        'event', event,
        'note', note));
  end if;

  if new.is_featured is distinct from old.is_featured then
    perform public.write_audit(
      'ad.featured_changed', 'advertisement', new.id,
      format('%s featured placement %s', new.reference,
             case when new.is_featured then 'granted' else 'withdrawn' end),
      jsonb_build_object('is_featured', old.is_featured, 'featured_until', old.featured_until),
      jsonb_build_object('is_featured', new.is_featured, 'featured_until', new.featured_until));
  end if;

  if public.is_staff()
     and new.user_id <> auth.uid()
     and (new.title is distinct from old.title
          or new.description is distinct from old.description
          or new.category_id is distinct from old.category_id
          or new.location_id is distinct from old.location_id
          or new.price is distinct from old.price
          or new.attributes is distinct from old.attributes) then
    perform public.write_audit(
      'ad.edited_by_staff', 'advertisement', new.id,
      coalesce(note, format('%s edited by the office', new.reference)),
      jsonb_build_object('title', old.title, 'description', old.description,
                         'category_id', old.category_id, 'location_id', old.location_id,
                         'price', old.price, 'attributes', old.attributes),
      jsonb_build_object('title', new.title, 'description', new.description,
                         'category_id', new.category_id, 'location_id', new.location_id,
                         'price', new.price, 'attributes', new.attributes,
                         'reference', new.reference, 'note', note));
  end if;

  return new;
end;
$$;

/*
 * Renewal entries go on the advertisement's own history, so the office sees
 * "renewal requested" between "expired" and "republished" where it happened.
 * The renewal's status travels as `renewal_status`, not `status`, so it is
 * never mistaken for the advertisement's.
 */
create or replace function public.audit_renewal_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ref text := (select reference from public.ads where id = new.ad_id);
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(
      'ad.renewal_requested', 'advertisement', new.ad_id,
      format('%s renewal #%s requested (%s)', ref, new.renewal_number, new.package_id),
      null,
      jsonb_build_object('renewal_id', new.id, 'renewal_number', new.renewal_number,
                         'renewal_status', new.status, 'timing', new.timing,
                         'package_id', new.package_id,
                         'previous_expires_at', new.previous_expires_at,
                         'reference', ref, 'event', 'renewal_requested'));
  elsif new.status is distinct from old.status then
    perform public.write_audit(
      'ad.renewal_' || new.status::text, 'advertisement', new.ad_id,
      coalesce(new.decision_note,
               format('%s renewal #%s %s', ref, new.renewal_number, new.status)),
      jsonb_build_object('renewal_status', old.status),
      jsonb_build_object('renewal_id', new.id, 'renewal_number', new.renewal_number,
                         'renewal_status', new.status,
                         'new_published_at', new.new_published_at,
                         'new_expires_at', new.new_expires_at,
                         'reference', ref, 'note', new.decision_note,
                         'event', 'renewal_' || new.status::text));
  end if;
  return new;
end;
$$;

drop trigger if exists ad_renewals_audit on public.ad_renewals;
create trigger ad_renewals_audit
  after insert or update on public.ad_renewals
  for each row execute function public.audit_renewal_change();

/*
 * A renewal waiting on an advertisement is settled by what happens to that
 * advertisement: approved into a fresh run means the renewal is approved,
 * refused means it is refused, withdrawn by its owner means withdrawn. The
 * office can therefore use the ordinary Approve and Reject buttons on a
 * renewed advertisement in the queue, and the history still comes out right.
 */
create or replace function public.settle_ad_renewal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'approved' and (old.expires_at is null or old.expires_at <= now()) then
    update public.ad_renewals
       set status = 'approved', decided_at = now(), decided_by = auth.uid(),
           decision_note = nullif(current_setting('shree.moderation_note', true), ''),
           new_published_at = new.published_at, new_expires_at = new.expires_at
     where ad_id = new.id and status = 'pending';
  elsif new.status = 'rejected' then
    update public.ad_renewals
       set status = 'rejected', decided_at = now(), decided_by = auth.uid(),
           decision_note = new.rejection_reason
     where ad_id = new.id and status = 'pending';
  elsif new.status = 'draft' then
    update public.ad_renewals
       set status = 'withdrawn', decided_at = now(), decided_by = auth.uid()
     where ad_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists ads_settle_renewal on public.ads;
create trigger ads_settle_renewal
  after update of status on public.ads
  for each row execute function public.settle_ad_renewal();

-- ------------------------------------------------ asking for a renewal ------
/*
 * The advertiser's side.
 *
 * SECURITY DEFINER, because the two things a renewal does — move a finished
 * advertisement back to the queue, and change its package — are exactly the
 * two things the guard refuses an owner. It checks everything the guard would
 * have, itself, first: that the caller owns the advertisement (the answer to a
 * stranger's id is "no such advertisement", the same as for one that does not
 * exist), that the package is real and on sale, that nothing is already
 * waiting, and that the advertisement is due. The id and package come from
 * the browser; nothing else does.
 */
create or replace function public.request_renewal(p_ad_id uuid, p_package_id text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid     uuid := auth.uid();
  ad      public.ads%rowtype;
  soon    int  := public.setting_int('ads.expiring_soon_days', 7);
  timing  text;
  number  int;
  created uuid;
begin
  if uid is null then
    raise exception 'Please sign in to renew an advertisement' using errcode = 'insufficient_privilege';
  end if;

  select * into ad from public.ads where id = p_ad_id for update;
  if not found or ad.user_id <> uid then
    raise exception 'No such advertisement' using errcode = 'no_data_found';
  end if;

  if exists (select 1 from public.profiles where id = uid and is_blocked) then
    raise exception 'This account cannot renew advertisements' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.packages where id = p_package_id and is_active) then
    raise exception 'That package is not available' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.ad_renewals where ad_id = p_ad_id and status = 'pending') then
    raise exception 'A renewal is already waiting for review' using errcode = 'check_violation';
  end if;

  if ad.status = 'expired' or (ad.status = 'approved' and ad.expires_at <= now()) then
    timing := 'after_expiry';
  elsif ad.status = 'approved' and ad.expires_at <= now() + make_interval(days => soon) then
    timing := 'early';
  elsif ad.status = 'approved' then
    raise exception 'This advertisement is not due for renewal yet' using errcode = 'check_violation';
  else
    raise exception 'Only a live or expired advertisement can be renewed' using errcode = 'check_violation';
  end if;

  select coalesce(max(renewal_number), 0) + 1 into number
    from public.ad_renewals where ad_id = p_ad_id;

  insert into public.ad_renewals (ad_id, user_id, renewal_number, package_id, timing,
                                  previous_published_at, previous_expires_at)
  values (p_ad_id, uid, number, p_package_id, timing, ad.published_at, ad.expires_at)
  returning id into created;

  if timing = 'after_expiry' then
    -- Lapsed but not yet swept: record the end of the run first, so the
    -- history says "expired" before it says "renewal requested".
    if ad.status = 'approved' then
      update public.ads set status = 'expired' where id = p_ad_id;
    end if;

    perform set_config('shree.owner_renewal', p_ad_id::text, true);
    -- The renewal row records "renewal requested"; the status change
    -- is named for what it is, so the history does not say it twice.
    perform set_config('shree.lifecycle_event', 'renewal_review', true);
    update public.ads set status = 'pending', package_id = p_package_id where id = p_ad_id;
    perform set_config('shree.owner_renewal', '', true);
    perform set_config('shree.lifecycle_event', '', true);
  end if;

  return created;
end;
$$;

revoke all on function public.request_renewal(uuid, text) from public;
grant execute on function public.request_renewal(uuid, text) to authenticated;

-- ---------------------------------------------- deciding on a renewal ------
/*
 * The office's side. Staff — moderators included, because this is a review
 * decision like any other.
 *
 * An early renewal of a live advertisement extends its current run by the
 * package's duration: the advertiser who renews three days early does not
 * lose those three days. A renewal of a finished advertisement publishes it
 * afresh from now.
 */
create or replace function public.approve_renewal(p_renewal_id uuid, p_note text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        public.ad_renewals%rowtype;
  ad       public.ads%rowtype;
  note     text := nullif(btrim(coalesce(p_note, '')), '');
  new_exp  timestamptz;
begin
  if not public.is_staff() then
    raise exception 'Only Shree Classified staff can approve a renewal' using errcode = 'insufficient_privilege';
  end if;

  select * into r from public.ad_renewals where id = p_renewal_id for update;
  if not found then
    raise exception 'No such renewal' using errcode = 'no_data_found';
  end if;
  if r.status <> 'pending' then
    raise exception 'This renewal has already been decided' using errcode = 'check_violation';
  end if;

  select * into ad from public.ads where id = r.ad_id for update;

  if ad.status = 'approved' and ad.expires_at > now() then
    new_exp := ad.expires_at + make_interval(days => public.package_duration_days(r.package_id));
    update public.ads set expires_at = new_exp, package_id = r.package_id where id = ad.id;
    update public.ad_renewals
       set status = 'approved', decided_at = now(), decided_by = auth.uid(), decision_note = note,
           new_published_at = ad.published_at, new_expires_at = new_exp
     where id = r.id;
  elsif ad.status in ('approved', 'expired', 'pending') then
    -- Finished, or waiting in the queue because of this renewal. Through the
    -- queue into a fresh run; `settle_ad_renewal()` closes the request.
    if ad.status = 'approved' then
      update public.ads set status = 'expired' where id = ad.id;
    end if;
    if ad.status in ('approved', 'expired') then
      perform set_config('shree.lifecycle_event', 'renewal_review', true);
      update public.ads set status = 'pending' where id = ad.id;
    end if;
    -- The status change is "republished" (named by the audit trigger); the
    -- renewal row, closed by settle_ad_renewal(), is "renewal approved".
    perform set_config('shree.moderation_note', coalesce(note, ''), true);
    perform set_config('shree.lifecycle_event', '', true);
    update public.ads set status = 'approved', package_id = r.package_id where id = ad.id
      returning expires_at into new_exp;
  else
    raise exception 'An advertisement that is % cannot be renewed', ad.status
      using errcode = 'check_violation';
  end if;

  perform set_config('shree.moderation_note', '', true);
  perform set_config('shree.lifecycle_event', '', true);
  return new_exp;
end;
$$;

revoke all on function public.approve_renewal(uuid, text) from public;
grant execute on function public.approve_renewal(uuid, text) to authenticated;

create or replace function public.reject_renewal(p_renewal_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r    public.ad_renewals%rowtype;
  ad   public.ads%rowtype;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_staff() then
    raise exception 'Only Shree Classified staff can refuse a renewal' using errcode = 'insufficient_privilege';
  end if;
  if note is null then
    raise exception 'A reason is required to refuse a renewal' using errcode = 'check_violation';
  end if;

  select * into r from public.ad_renewals where id = p_renewal_id for update;
  if not found then
    raise exception 'No such renewal' using errcode = 'no_data_found';
  end if;
  if r.status <> 'pending' then
    raise exception 'This renewal has already been decided' using errcode = 'check_violation';
  end if;

  select * into ad from public.ads where id = r.ad_id for update;

  if ad.status = 'pending' then
    -- It is in the queue because of this request: refusing the renewal is
    -- refusing the advertisement, with the same reason.
    perform set_config('shree.moderation_note', note, true);
    update public.ads set status = 'rejected', rejection_reason = note where id = ad.id;
    perform set_config('shree.moderation_note', '', true);
    perform set_config('shree.lifecycle_event', '', true);
  else
    update public.ad_renewals
       set status = 'rejected', decided_at = now(), decided_by = auth.uid(), decision_note = note
     where id = r.id;
  end if;
end;
$$;

revoke all on function public.reject_renewal(uuid, text) from public;
grant execute on function public.reject_renewal(uuid, text) to authenticated;

-- ------------------------------------------------ administrator override ----
/*
 * Extend a live advertisement's run to a later date. Administrators only, a
 * reason always, and within `ads.max_extension_days` of today. An expired
 * advertisement cannot be "extended" back to life — that is a renewal, and it
 * goes through review.
 */
create or replace function public.extend_advertisement_expiry(
  p_ad_id          uuid,
  p_new_expires_at timestamptz,
  p_reason         text
)
returns timestamptz
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- Named columns, not `*`: this runs as the caller, and the contact columns
  -- are not granted to anybody at the table.
  ad      record;
  reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  ceiling int  := public.setting_int('ads.max_extension_days', 365);
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can extend an advertisement' using errcode = 'insufficient_privilege';
  end if;
  if reason is null then
    raise exception 'A reason is required to extend an advertisement' using errcode = 'check_violation';
  end if;

  select id, status, expires_at, reference into ad
    from public.ads where id = p_ad_id for update;
  if not found then
    raise exception 'No such advertisement' using errcode = 'no_data_found';
  end if;
  if ad.status <> 'approved' or ad.expires_at <= now() then
    raise exception 'Only a live advertisement can be extended; a finished one is renewed'
      using errcode = 'check_violation';
  end if;
  if p_new_expires_at is null or p_new_expires_at <= ad.expires_at then
    raise exception 'The new expiry date must be later than the current one'
      using errcode = 'check_violation';
  end if;
  if p_new_expires_at > now() + make_interval(days => ceiling) then
    raise exception 'The new expiry date must be within % days of today', ceiling
      using errcode = 'check_violation';
  end if;

  update public.ads set expires_at = p_new_expires_at where id = p_ad_id;

  perform public.write_audit(
    'ad.expiry_extended', 'advertisement', p_ad_id, reason,
    jsonb_build_object('expires_at', ad.expires_at, 'status', ad.status),
    jsonb_build_object('expires_at', p_new_expires_at, 'status', ad.status,
                       'reference', ad.reference, 'note', reason, 'event', 'expiry_extended'));

  return p_new_expires_at;
end;
$$;

revoke all on function public.extend_advertisement_expiry(uuid, timestamptz, text) from public;
grant execute on function public.extend_advertisement_expiry(uuid, timestamptz, text) to authenticated;

/*
 * The moderation call, as 0009, with "expire" now an administrator's decision
 * that requires a reason, and each action naming its lifecycle event.
 */
create or replace function public.moderate_advertisement(
  p_ad_id  uuid,
  p_action text,
  p_note   text default null
)
returns public.ad_status
language plpgsql
set search_path = public, pg_temp
as $$
declare
  current_status public.ad_status;
  target_status  public.ad_status;
  note           text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_staff() then
    raise exception 'Only Shree Classified staff can moderate an advertisement'
      using errcode = 'insufficient_privilege';
  end if;

  select status into current_status from public.ads where id = p_ad_id;
  if not found then
    raise exception 'No such advertisement' using errcode = 'no_data_found';
  end if;

  target_status := case p_action
    when 'approve'         then 'approved'
    when 'reject'          then 'rejected'
    when 'request_changes' then 'changes_requested'
    when 'unpublish'       then 'pending'
    when 'expire'          then 'expired'
    when 'restore'         then 'pending'
    else null
  end::public.ad_status;

  if target_status is null then
    raise exception 'Unknown moderation action %', p_action using errcode = 'check_violation';
  end if;

  if p_action = 'expire' and not public.is_admin() then
    raise exception 'Only an administrator can mark an advertisement as expired'
      using errcode = 'insufficient_privilege';
  end if;

  if p_action in ('reject', 'request_changes', 'expire') and note is null then
    raise exception 'A reason is required to % an advertisement', replace(p_action, '_', ' ')
      using errcode = 'check_violation';
  end if;

  if not public.is_permitted_ad_transition(current_status, target_status) then
    raise exception 'An advertisement cannot go from % to %', current_status, target_status
      using errcode = 'insufficient_privilege';
  end if;

  perform set_config('shree.moderation_note', coalesce(note, ''), true);
  if p_action = 'expire' then
    perform set_config('shree.lifecycle_event', 'expired_manually', true);
  end if;

  update public.ads
     set status = target_status,
         rejection_reason = case
           when target_status in ('rejected', 'changes_requested') then note
           else null
         end
   where id = p_ad_id;

  perform set_config('shree.moderation_note', '', true);
  perform set_config('shree.lifecycle_event', '', true);
  return target_status;
end;
$$;

revoke all on function public.moderate_advertisement(uuid, text, text) from public;
grant execute on function public.moderate_advertisement(uuid, text, text) to authenticated;

-- --------------------------------------------------------- the sweep -------
/*
 * Retires every advertisement whose run has ended.
 *
 * Idempotent by construction: it only touches rows that are `approved` with an
 * expiry in the past, and it moves them out of `approved`, so a second run has
 * nothing to find and writes nothing — no second status change, no second
 * audit entry. Safe to call from pg_cron, a platform cron hitting the app, or
 * by hand. It is bookkeeping, not the visibility rule: `public_ads` stops
 * showing an advertisement the moment its date passes, sweep or no sweep.
 */
create or replace function public.expire_advertisements()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected int;
begin
  -- The scheduler (a trusted connection: service role, pg_cron, the SQL
  -- editor) or somebody in the office pressing "run now". Nobody else.
  if not (public.is_trusted_connection() or public.is_staff()) then
    raise exception 'Only Shree Classified staff can run the expiry sweep'
      using errcode = 'insufficient_privilege';
  end if;

  perform set_config('shree.lifecycle_event', 'expired_automatically', true);
  perform set_config('shree.moderation_note', 'The run ended on its expiry date.', true);

  update public.ads
     set status = 'expired'
   where status = 'approved'
     and expires_at <= now();
  get diagnostics affected = row_count;

  update public.ads
     set is_featured = false, featured_until = null
   where is_featured and featured_until <= now();

  perform set_config('shree.lifecycle_event', '', true);
  perform set_config('shree.moderation_note', '', true);
  return affected;
end;
$$;

revoke all on function public.expire_advertisements() from public, anon, authenticated;
grant execute on function public.expire_advertisements() to authenticated, service_role;

-- The 0001 name, kept so anything already scheduled against it keeps working.
create or replace function public.expire_stale_ads()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$ select public.expire_advertisements(); $$;

revoke all on function public.expire_stale_ads() from public, anon, authenticated;
grant execute on function public.expire_stale_ads() to authenticated, service_role;

-- --------------------------------------------------- expired public URL ----
/*
 * What the public may know about an advertisement that has finished: that it
 * existed, its title and section, and when it ended — enough for "this
 * advertisement is no longer active" and a link to similar live ones. Never
 * its contact details, never its description, and nothing at all about an
 * advertisement that was refused or never published.
 */
create or replace function public.expired_ad_stub(p_slug text)
returns table (
  slug          text,
  title         text,
  category_slug text,
  category_name text,
  location_slug text,
  ended_at      timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.slug, a.title, c.slug, c.name, l.slug, a.expires_at
    from public.ads a
    left join public.categories c on c.id = a.category_id
    left join public.locations  l on l.id = a.location_id
   where a.slug = p_slug
     and a.published_at is not null
     and a.expires_at <= now()
     and a.status in ('approved', 'expired', 'pending', 'changes_requested');
$$;

revoke all on function public.expired_ad_stub(text) from public;
grant execute on function public.expired_ad_stub(text) to anon, authenticated;

-- ---------------------------------------------------------- office views ----
drop view if exists public.admin_actions;
create view public.admin_actions
with (security_invoker = true) as
  select
    l.id,
    l.occurred_at,
    l.action,
    l.entity,
    l.entity_id,
    l.summary,
    l.before,
    l.after,
    l.actor_id,
    actor.full_name            as actor_name,
    actor.role                 as actor_role,
    coalesce(a.reference, l.after ->> 'reference') as ad_reference,
    a.title                    as ad_title,
    l.before ->> 'status'      as previous_status,
    l.after  ->> 'status'      as new_status,
    l.after  ->> 'note'        as note,
    l.after  ->> 'event'       as event
  from public.audit_log l
  left join public.profiles actor on actor.id = l.actor_id
  left join public.ads a
    on a.id = l.entity_id and l.entity = 'advertisement';

revoke all on public.admin_actions from anon, authenticated;
grant select on public.admin_actions to authenticated;

drop view if exists public.moderation_ads;
create view public.moderation_ads as
  select
    a.*,
    p.full_name  as advertiser_name,
    p.email      as advertiser_email,
    p.phone      as advertiser_phone,
    p.created_at as advertiser_since,
    p.is_blocked as advertiser_blocked,
    c.slug       as category_slug,
    c.name       as category_name,
    l.slug       as location_slug,
    l.name       as location_name,
    (select count(*) from public.ad_images i where i.ad_id = a.id)::int  as image_count,
    (select count(*) from public.ad_artwork w where w.ad_id = a.id)::int as artwork_count,
    (select count(*) from public.ad_reports r
      where r.ad_id = a.id and r.status in ('open', 'reviewing'))::int   as open_report_count,
    extract(epoch from (now() - a.created_at))::bigint / 3600            as hours_waiting,
    decision.occurred_at as last_decision_at,
    decision.actor_name  as last_decision_by,
    (a.status = 'approved' and a.expires_at <= now()) as is_lapsed,
    renewal.id           as pending_renewal_id,
    renewal.timing       as pending_renewal_timing,
    renewal.requested_at as pending_renewal_requested_at,
    renewal.package_id   as pending_renewal_package_id,
    (select count(*) from public.ad_renewals rr where rr.ad_id = a.id)::int as renewal_count
  from public.ads a
  join public.profiles p on p.id = a.user_id
  left join public.categories c on c.id = a.category_id
  left join public.locations  l on l.id = a.location_id
  left join lateral (
    select log.occurred_at, actor.full_name as actor_name
      from public.audit_log log
      left join public.profiles actor on actor.id = log.actor_id
     where log.entity = 'advertisement'
       and log.entity_id = a.id
       and log.action = 'ad.status_changed'
     order by log.occurred_at desc
     limit 1
  ) decision on true
  left join public.ad_renewals renewal
    on renewal.ad_id = a.id and renewal.status = 'pending'
  where public.is_staff();

comment on view public.moderation_ads is
  'Every advertisement for the office, with the advertiser''s details, the last decision, and any renewal waiting. Returns nothing unless the caller is staff.';

revoke all on public.moderation_ads from anon, authenticated;
grant select on public.moderation_ads to authenticated;

/*
 * Dashboard counts, with the two lifecycle figures added. "Today" is the
 * calendar day in India, not in UTC — a submission at 2 a.m. IST is today's.
 */
create or replace function public.admin_dashboard_counts()
returns table (metric text, value bigint)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  today_ist timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  soon      int := public.setting_int('ads.expiring_soon_days', 7);
begin
  if not public.is_staff() then
    raise exception 'Only Shree Classified staff can read the dashboard'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select * from (
    select 'pending'::text,     count(*) filter (where status = 'pending') from public.ads
    union all
    select 'changes_requested', count(*) filter (where status = 'changes_requested') from public.ads
    union all
    select 'approved',          count(*) filter (where status = 'approved' and expires_at > now()) from public.ads
    union all
    select 'rejected',          count(*) filter (where status = 'rejected') from public.ads
    union all
    select 'expired',           count(*) filter (where status = 'expired' or (status = 'approved' and expires_at <= now())) from public.ads
    union all
    select 'expiring_soon',     count(*) filter (where status = 'approved' and expires_at > now()
                                                   and expires_at <= now() + make_interval(days => soon)) from public.ads
    union all
    select 'submitted_today',   count(*) filter (where created_at >= today_ist) from public.ads
    union all
    select 'open_reports',      count(*) filter (where status in ('open', 'reviewing')) from public.ad_reports
    union all
    select 'renewals_pending',  count(*) filter (where status = 'pending') from public.ad_renewals
    union all
    select 'users',             count(*) from public.profiles
  ) as counts(metric, value);
end;
$$;

revoke all on function public.admin_dashboard_counts() from public;
grant execute on function public.admin_dashboard_counts() to authenticated;
