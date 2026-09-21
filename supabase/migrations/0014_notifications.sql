-- =============================================================================
-- Shree Classified — Phase 10: telling people what happened
--
-- Three tables and one rule: the notification is written in the same
-- transaction as the thing it describes, and the DELIVERY of it is not.
--
-- That split is the whole design. An advertiser's advertisement is approved by
-- `moderate_advertisement()`, inside one transaction, and the row that says so
-- is written by a trigger on the same statement — so there is no approval that
-- failed to produce a notification, whichever of the several paths to approval
-- was taken. But the email about it is a row in `notification_deliveries` with
-- `status = 'queued'`, drained afterwards by a worker. A provider that is down,
-- slow, or misconfigured therefore cannot roll back an approval, fail a
-- payment, or abort the expiry sweep. The outbox is the seam.
--
-- What is NOT here: any provider, any API key, any HTML. The database knows
-- that an email is owed to a user about an advertisement; it does not know
-- what Resend is. That lives in `src/lib/notifications/`.
--
-- On idempotency, which is the other thing that goes wrong with notifications:
-- every notification carries a `dedupe_key`, unique per user and type. The
-- expiry reminder keys on the advertisement's expiry date, so the daily sweep
-- can run every day for a week and send one reminder — and a renewal that
-- moves the date earns a new one, which is correct rather than a bug.
-- =============================================================================

-- ------------------------------------------------------- the vocabulary ----
/*
 * A controlled list, as an enum, so that a notification type is checked by
 * the database rather than by whoever last copied a string. Adding one is a
 * migration, which is the right amount of friction: every type needs a
 * template and a preference group to go with it.
 */
do $$ begin
  create type public.notification_type as enum (
    'advertisement_submitted',
    'advertisement_approved',
    'advertisement_rejected',
    'advertisement_changes_requested',
    'advertisement_expiring',
    'advertisement_expired',
    'renewal_submitted',
    'renewal_approved',
    'renewal_rejected',
    'payment_successful',
    'payment_failed',
    'payment_cancelled',
    -- Staff only, from here down.
    'staff_advertisement_submitted',
    'staff_renewal_submitted',
    'staff_payment_received',
    'staff_report_received'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_channel as enum ('in_app', 'email', 'whatsapp');
exception when duplicate_object then null; end $$;

/*
 * `skipped` is a real outcome and not a failure: it is what a delivery gets
 * when the recipient has no email address, or has turned that channel off
 * between the notification being raised and the queue being drained. Recording
 * it as `failed` would have somebody investigating a provider that was never
 * asked to do anything.
 */
do $$ begin
  create type public.notification_delivery_status as enum (
    'queued', 'sent', 'failed', 'skipped'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------- what people are told --
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        public.notification_type not null,
  title       text not null check (char_length(btrim(title)) between 3 and 120),
  body        text not null check (char_length(btrim(body)) between 3 and 500),
  -- What it is about, so a notification can be found again from the thing.
  entity_type text check (entity_type is null or entity_type in ('advertisement', 'payment', 'renewal', 'report')),
  entity_id   uuid,
  /*
   * Where it points. Stored rather than derived, because the page an
   * advertiser should land on depends on what happened, and a reader of this
   * table should not have to re-derive that. Constrained to a path on this
   * site: a notification is never a way to send somebody somewhere else.
   */
  href        text check (href is null or href ~ '^/[A-Za-z0-9/_-]*$'),
  is_read     boolean not null default false,
  read_at     timestamptz,
  /*
   * What makes this notification the same as one already sent. See the note
   * at the top: the expiry reminder keys on the expiry date, so a sweep that
   * runs daily sends one reminder, and a renewal that moves the date earns a
   * new one.
   */
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  constraint notifications_read_together check ((is_read = false) = (read_at is null))
);

comment on table public.notifications is
  'One row per thing an advertiser or staff member is told. Written in the same transaction as the event; delivery is separate.';

create unique index if not exists notifications_dedupe_idx
  on public.notifications (user_id, type, dedupe_key);

create index if not exists notifications_inbox_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where not is_read;

-- ------------------------------------------------------------ the outbox ----
/*
 * One row per notification per channel that is not `in_app`.
 *
 * `in_app` needs no row: the notification IS the in-app delivery, and a queue
 * entry for it would be a job that copies a row to itself.
 */
create table if not exists public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel         public.notification_channel not null check (channel <> 'in_app'),
  status          public.notification_delivery_status not null default 'queued',
  attempts        integer not null default 0 check (attempts >= 0),
  -- Set forward by the worker on a retry, so backoff is a query rather than a
  -- sleep held open in a request.
  scheduled_at    timestamptz not null default now(),
  sent_at         timestamptz,
  failed_at       timestamptz,
  -- The provider's complaint, for the office. Never a credential: the worker
  -- passes a short reason, not a raw response.
  error           text check (error is null or char_length(error) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint notification_deliveries_one_per_channel unique (notification_id, channel)
);

comment on table public.notification_deliveries is
  'The outbox. A provider being down delays a row here; it never rolls back the approval, payment or sweep that raised it.';

create index if not exists notification_deliveries_due_idx
  on public.notification_deliveries (scheduled_at)
  where status = 'queued';

drop trigger if exists notification_deliveries_set_updated_at on public.notification_deliveries;
create trigger notification_deliveries_set_updated_at
  before update on public.notification_deliveries
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------- what people want --
/*
 * Preferences, by group rather than by type.
 *
 * Sixteen switches would be a settings page nobody finishes reading. Three
 * groups — what happened to my advertisement, what happened to my money, and
 * remind me before it ends — is what somebody actually has an opinion about.
 *
 * `in_app` has no switch. It is the record of what the office did to your
 * advertisement, it costs nothing to receive, and a customer who has turned
 * off every channel must still be able to find out why their advertisement
 * was refused.
 */
create table if not exists public.notification_preferences (
  user_id                     uuid primary key references public.profiles (id) on delete cascade,
  email_advertisement_updates boolean not null default true,
  email_payment_updates       boolean not null default true,
  email_expiry_reminders      boolean not null default true,
  whatsapp_advertisement_updates boolean not null default false,
  whatsapp_payment_updates       boolean not null default false,
  whatsapp_expiry_reminders      boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Per-advertiser channel choices. WhatsApp defaults to off: a message to somebody''s telephone is not something to opt them into.';

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

/** Which preference group a type belongs to. One place, so a new type cannot quietly become unswitchable. */
create or replace function public.notification_group(p_type public.notification_type)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_type in ('payment_successful', 'payment_failed', 'payment_cancelled') then 'payment'
    when p_type in ('advertisement_expiring', 'advertisement_expired') then 'expiry'
    else 'advertisement'
  end;
$$;

-- =========================================================================
-- Raising a notification
-- =========================================================================
/*
 * The one way a notification is created.
 *
 * Called from triggers, so it runs inside the transaction that caused it. It
 * writes the in-app row and queues whatever channels the recipient has asked
 * for — reading their preferences here, once, rather than leaving the worker
 * to decide later whether a message was wanted.
 *
 * `on conflict do nothing` on the dedupe key is what makes the whole thing
 * safe to call twice: a repeated webhook, a sweep run twice in a day, a
 * moderator pressing Approve on a stale page. The second call writes nothing
 * and raises nothing.
 */
create or replace function public.raise_notification(
  p_user_id     uuid,
  p_type        public.notification_type,
  p_title       text,
  p_body        text,
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_href        text default null,
  p_dedupe_key  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created uuid;
  grp     text := public.notification_group(p_type);
  prefs   public.notification_preferences%rowtype;
  contact public.profiles%rowtype;
  wants_email    boolean;
  wants_whatsapp boolean;
begin
  if p_user_id is null then return null; end if;

  insert into public.notifications (user_id, type, title, body, entity_type, entity_id, href, dedupe_key)
  values (p_user_id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_href,
          coalesce(p_dedupe_key, coalesce(p_entity_id::text, gen_random_uuid()::text)))
  on conflict (user_id, type, dedupe_key) do nothing
  returning id into created;

  -- Already told them. Nothing more to do, and not an error.
  if created is null then return null; end if;

  select * into contact from public.profiles where id = p_user_id;
  select * into prefs from public.notification_preferences where user_id = p_user_id;

  -- No row means the defaults, which is what a new account has.
  wants_email := case grp
    when 'payment'   then coalesce(prefs.email_payment_updates, true)
    when 'expiry'    then coalesce(prefs.email_expiry_reminders, true)
    else                  coalesce(prefs.email_advertisement_updates, true)
  end;
  wants_whatsapp := case grp
    when 'payment'   then coalesce(prefs.whatsapp_payment_updates, false)
    when 'expiry'    then coalesce(prefs.whatsapp_expiry_reminders, false)
    else                  coalesce(prefs.whatsapp_advertisement_updates, false)
  end;

  -- A channel with nowhere to send is not queued at all, rather than queued
  -- and failed: there is nothing for a worker to retry.
  if wants_email and coalesce(btrim(contact.email), '') <> '' then
    insert into public.notification_deliveries (notification_id, channel) values (created, 'email')
    on conflict do nothing;
  end if;
  if wants_whatsapp and coalesce(btrim(contact.phone), '') <> '' then
    insert into public.notification_deliveries (notification_id, channel) values (created, 'whatsapp')
    on conflict do nothing;
  end if;

  return created;
end;
$$;

comment on function public.raise_notification is
  'Creates a notification and queues the channels the recipient wants. Idempotent on (user, type, dedupe_key).';

/** The same, to every member of staff. Used for the office's own queue notices. */
create or replace function public.raise_staff_notification(
  p_type        public.notification_type,
  p_title       text,
  p_body        text,
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_href        text default null,
  p_dedupe_key  text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member record;
  n int := 0;
begin
  for member in
    select id from public.profiles
     where role in ('admin', 'moderator') and not is_blocked
  loop
    perform public.raise_notification(
      member.id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_href, p_dedupe_key);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- =========================================================================
-- The events
-- =========================================================================
/*
 * Advertisements.
 *
 * As a trigger on `ads`, for the same reason the renewal payment guard is a
 * trigger: approval is reachable from `moderate_advertisement()`, from a bulk
 * action, from the renewal path and from an administrator's own hand, and a
 * notification written in only one of those is a notification most people will
 * not get.
 *
 * The advertiser's own reference is used throughout rather than the title,
 * because it is what they are asked to quote when they telephone.
 */
create or replace function public.notify_ad_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  href text := '/my-ads/' || new.id::text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.raise_notification(
        new.user_id, 'advertisement_submitted',
        'We have your advertisement',
        format('%s has been received and is waiting to be read by our office.', new.reference),
        'advertisement', new.id, href, new.id::text || ':submitted');

      perform public.raise_staff_notification(
        'staff_advertisement_submitted',
        'New advertisement to review',
        format('%s is waiting in the queue.', new.reference),
        'advertisement', new.id, '/admin/advertisements/' || new.id::text,
        new.id::text || ':submitted');
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Keyed on the status change itself, so a status reached twice — approved,
  -- unpublished, approved again — is told twice, which is right, while one
  -- approval processed twice is told once.
  if new.status = 'approved' then
    perform public.raise_notification(
      new.user_id, 'advertisement_approved',
      'Your advertisement is published',
      format('%s is now on the site and runs until %s.',
             new.reference, to_char(new.expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY')),
      'advertisement', new.id, href,
      new.id::text || ':approved:' || coalesce(new.published_at::text, now()::text));

  elsif new.status = 'rejected' then
    perform public.raise_notification(
      new.user_id, 'advertisement_rejected',
      'Your advertisement was not accepted',
      format('%s was not accepted. %s', new.reference,
             coalesce(nullif(btrim(new.rejection_reason), ''), 'Please contact our office.')),
      'advertisement', new.id, href,
      new.id::text || ':rejected:' || now()::text);

  elsif new.status = 'changes_requested' then
    perform public.raise_notification(
      new.user_id, 'advertisement_changes_requested',
      'Your advertisement needs a change',
      format('%s needs a small change before it can be published. %s', new.reference,
             coalesce(nullif(btrim(new.rejection_reason), ''), '')),
      'advertisement', new.id, href || '/edit',
      new.id::text || ':changes:' || now()::text);

  elsif new.status = 'expired' then
    perform public.raise_notification(
      new.user_id, 'advertisement_expired',
      'Your advertisement has finished its run',
      format('%s has expired and is no longer shown to readers. You can renew it.', new.reference),
      'advertisement', new.id, href || '/renew',
      new.id::text || ':expired:' || coalesce(new.expires_at::text, now()::text));
  end if;

  return new;
end;
$$;

drop trigger if exists ads_notify on public.ads;
create trigger ads_notify
  after insert or update on public.ads
  for each row execute function public.notify_ad_change();

/* Renewals: asked for, and decided. */
create or replace function public.notify_renewal_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ref  text := (select reference from public.ads where id = new.ad_id);
  href text := '/my-ads/' || new.ad_id::text;
begin
  if tg_op = 'INSERT' then
    perform public.raise_notification(
      new.user_id, 'renewal_submitted',
      'We have your renewal request',
      format('Your renewal of %s is with our office. The new run starts once it is approved.', ref),
      'renewal', new.id, href, new.id::text || ':requested');

    perform public.raise_staff_notification(
      'staff_renewal_submitted',
      'Renewal waiting for a decision',
      format('%s has been sent for renewal.', ref),
      'renewal', new.id, '/admin/advertisements/renewals', new.id::text || ':requested');
    return new;
  end if;

  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'approved' then
    perform public.raise_notification(
      new.user_id, 'renewal_approved',
      'Your renewal is approved',
      format('%s has been renewed and now runs until %s.', ref,
             to_char(new.new_expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY')),
      'renewal', new.id, href, new.id::text || ':approved');

  elsif new.status = 'rejected' then
    perform public.raise_notification(
      new.user_id, 'renewal_rejected',
      'Your renewal was not approved',
      format('The renewal of %s was not approved. %s', ref,
             coalesce(nullif(btrim(new.decision_note), ''), 'Please contact our office.')),
      'renewal', new.id, href, new.id::text || ':rejected');
  end if;

  return new;
end;
$$;

drop trigger if exists ad_renewals_notify on public.ad_renewals;
create trigger ad_renewals_notify
  after insert or update on public.ad_renewals
  for each row execute function public.notify_renewal_change();

/*
 * Payments.
 *
 * The wording here is the thing Phase 9 was most insistent about and Phase 10
 * repeats: a successful payment is not a published advertisement. The message
 * says what was paid and that the advertisement is still to be read.
 */
create or replace function public.notify_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ref    text := (select reference from public.ads where id = new.ad_id);
  amount text := to_char(new.amount_paise / 100.0, 'FM999G999G990D00');
  href   text := '/my-ads/payments/' || new.id::text;
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'paid' then
    perform public.raise_notification(
      new.user_id, 'payment_successful',
      'Payment received',
      format('We have received ₹%s for %s. Your advertisement is now awaiting review.', amount, ref),
      'payment', new.id, href, new.id::text || ':paid');

    perform public.raise_staff_notification(
      'staff_payment_received',
      'Payment received',
      format('₹%s settled against %s.', amount, ref),
      'payment', new.id, '/admin/payments', new.id::text || ':paid');

  elsif new.status = 'failed' then
    perform public.raise_notification(
      new.user_id, 'payment_failed',
      'Your payment did not complete',
      format('The payment of ₹%s for %s was not completed. Nothing has been charged.', amount, ref),
      'payment', new.id, href, new.id::text || ':failed');

  elsif new.status = 'cancelled' then
    perform public.raise_notification(
      new.user_id, 'payment_cancelled',
      'Payment cancelled',
      format('The payment of ₹%s for %s was cancelled. Your advertisement is saved.', amount, ref),
      'payment', new.id, href, new.id::text || ':cancelled');
  end if;

  return new;
end;
$$;

drop trigger if exists payments_notify on public.payments;
create trigger payments_notify
  after update on public.payments
  for each row execute function public.notify_payment_change();

/* Reader reports, to the office only. A report says something about its reporter too. */
create or replace function public.notify_report_received()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.raise_staff_notification(
    'staff_report_received',
    'An advertisement has been reported',
    format('A reader reported an advertisement as %s.', new.reason),
    'report', new.id, '/admin/reports', new.id::text);
  return new;
end;
$$;

drop trigger if exists ad_reports_notify on public.ad_reports;
create trigger ad_reports_notify
  after insert on public.ad_reports
  for each row execute function public.notify_report_received();

-- ------------------------------------------------------ expiring soon ------
/*
 * The one notification that no state change produces.
 *
 * Nothing happens to an advertisement when it enters the expiring-soon
 * window; it simply becomes true. So this is a sweep, run beside the expiry
 * sweep, and its idempotency is the dedupe key: the advertisement's own expiry
 * date. Run it hourly for a week and one reminder is sent. Renew, and the new
 * date earns a new reminder — which is right, because it is a different run
 * ending.
 */
create or replace function public.notify_expiring_advertisements()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  soon int := public.setting_int('ads.expiring_soon_days', 7);
  ad   record;
  sent int := 0;
begin
  if not (public.is_trusted_connection() or public.is_staff()) then
    raise exception 'Only Shree Classified staff can run the expiry reminders'
      using errcode = 'insufficient_privilege';
  end if;

  for ad in
    select a.id, a.user_id, a.reference, a.expires_at
      from public.ads a
     where a.status = 'approved'
       and a.expires_at > now()
       and a.expires_at <= now() + make_interval(days => soon)
  loop
    if public.raise_notification(
         ad.user_id, 'advertisement_expiring',
         'Your advertisement is ending soon',
         format('%s runs until %s. Renew it to keep it on the site.',
                ad.reference,
                to_char(ad.expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY')),
         'advertisement', ad.id, '/my-ads/' || ad.id::text || '/renew',
         ad.id::text || ':expiring:' || ad.expires_at::text
       ) is not null then
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$$;

revoke all on function public.notify_expiring_advertisements() from public, anon, authenticated;
grant execute on function public.notify_expiring_advertisements() to authenticated, service_role;

-- =========================================================================
-- Reading and marking
-- =========================================================================
/*
 * Marking read is a function rather than an UPDATE policy, so that "only your
 * own" is stated once. The WHERE clause is the authorisation: another
 * advertiser's notification is not matched, so nothing is updated and nothing
 * is leaked about whether it exists.
 */
create or replace function public.mark_notification_read(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  n   int;
begin
  if uid is null then
    raise exception 'Please sign in' using errcode = 'insufficient_privilege';
  end if;

  update public.notifications
     set is_read = true, read_at = now()
   where id = p_id and user_id = uid and not is_read;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  n   int;
begin
  if uid is null then
    raise exception 'Please sign in' using errcode = 'insufficient_privilege';
  end if;

  update public.notifications
     set is_read = true, read_at = now()
   where user_id = uid and not is_read;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- =========================================================================
-- The worker's half
-- =========================================================================
/*
 * Claiming work.
 *
 * `for update skip locked` is what lets two workers — a cron firing while a
 * previous run is still going, say — drain the same queue without either
 * waiting on the other or both sending the same email. Claimed rows are moved
 * out of the due window immediately by incrementing `attempts` and pushing
 * `scheduled_at` forward, so a worker that dies mid-send leaves its rows to be
 * retried later rather than locked for ever.
 */
create or replace function public.claim_notification_deliveries(p_limit integer default 25)
returns table (
  delivery_id     uuid,
  channel         public.notification_channel,
  attempts        integer,
  notification_id uuid,
  user_id         uuid,
  type            public.notification_type,
  title           text,
  body            text,
  href            text,
  full_name       text,
  email           text,
  phone           text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_trusted_connection() then
    raise exception 'Only Shree Classified can send notifications'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with claimed as (
    update public.notification_deliveries d
       set attempts = d.attempts + 1,
           -- Held for five minutes. If the worker finishes, it says so and
           -- this never matters; if it dies, the row comes back by itself.
           scheduled_at = now() + interval '5 minutes'
     where d.id in (
       select c.id from public.notification_deliveries c
        where c.status = 'queued' and c.scheduled_at <= now()
        order by c.scheduled_at
        limit greatest(1, least(coalesce(p_limit, 25), 100))
        for update skip locked
     )
    returning d.id, d.channel, d.attempts, d.notification_id
  )
  select c.id, c.channel, c.attempts, n.id, n.user_id, n.type, n.title, n.body, n.href,
         p.full_name, p.email, p.phone
    from claimed c
    join public.notifications n on n.id = c.notification_id
    join public.profiles p on p.id = n.user_id;
end;
$$;

/*
 * Reporting the outcome.
 *
 * Failure is bounded: after `notifications.max_attempts` tries the row is
 * marked `failed` and left alone. A queue that retries for ever is a queue
 * that eventually sends a week-old "your advertisement expires in 3 days".
 * Backoff is exponential in minutes, computed here so the worker holds no
 * timing logic of its own.
 */
create or replace function public.complete_notification_delivery(
  p_id      uuid,
  p_status  public.notification_delivery_status,
  p_error   text default null
)
returns public.notification_delivery_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d        public.notification_deliveries%rowtype;
  max_try  int := public.setting_int('notifications.max_attempts', 4);
  reason   text := left(nullif(btrim(coalesce(p_error, '')), ''), 500);
begin
  if not public.is_trusted_connection() then
    raise exception 'Only Shree Classified can send notifications'
      using errcode = 'insufficient_privilege';
  end if;

  select * into d from public.notification_deliveries where id = p_id for update;
  if not found then
    raise exception 'No such delivery' using errcode = 'no_data_found';
  end if;
  if d.status <> 'queued' then
    return d.status;  -- Already settled. A second report changes nothing.
  end if;

  if p_status = 'sent' then
    update public.notification_deliveries
       set status = 'sent', sent_at = now(), error = null
     where id = p_id;
    return 'sent';
  end if;

  if p_status = 'skipped' then
    update public.notification_deliveries
       set status = 'skipped', error = reason
     where id = p_id;
    return 'skipped';
  end if;

  -- Failed. Retry with backoff until the attempts run out.
  if d.attempts >= max_try then
    update public.notification_deliveries
       set status = 'failed', failed_at = now(), error = reason
     where id = p_id;
    return 'failed';
  end if;

  update public.notification_deliveries
     set status = 'queued',
         scheduled_at = now() + make_interval(mins => power(3, d.attempts)::int),
         error = reason
   where id = p_id;
  return 'queued';
end;
$$;

insert into public.app_settings (key, value, description) values
  ('notifications.max_attempts', '4'::jsonb,
   'How many times a queued email or WhatsApp message is tried before it is left as failed.')
on conflict (key) do nothing;

-- =========================================================================
-- What each side reads
-- =========================================================================
create or replace view public.my_notifications
with (security_invoker = true)
as
select id, type, title, body, entity_type, entity_id, href, is_read, read_at, created_at
  from public.notifications
 where user_id = auth.uid();

comment on view public.my_notifications is
  'An advertiser''s own notifications. Ownership is the WHERE clause; the dedupe key is not in it.';

-- =========================================================================
-- Row level security
-- =========================================================================
alter table public.notifications            enable row level security;
alter table public.notification_deliveries  enable row level security;
alter table public.notification_preferences enable row level security;

-- Yours, and nobody else's — staff included. A notification is addressed to a
-- person; the office reads the audit trail, which is the record of what was
-- done, not the record of who was told.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());

-- Marking read goes through the functions above. No INSERT policy at all: a
-- notification is raised by a trigger, never by a request.
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The outbox is the worker's. Nobody reads it through the anon key.
revoke all on table public.notification_deliveries from anon, authenticated;

drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, update on public.notifications to authenticated;
grant select on public.my_notifications to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update on public.notification_deliveries to service_role;

revoke all on function public.raise_notification(uuid, public.notification_type, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.raise_staff_notification(public.notification_type, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
revoke all on function public.complete_notification_delivery(uuid, public.notification_delivery_status, text) from public, anon, authenticated;

grant execute on function public.claim_notification_deliveries(integer) to service_role;
grant execute on function public.complete_notification_delivery(uuid, public.notification_delivery_status, text) to service_role;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
