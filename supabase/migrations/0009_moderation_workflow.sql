-- =============================================================================
-- Shree Classified — Phase 7: the moderation workflow
--
-- Phase 6 decided who may moderate. This migration decides WHAT moderating is:
-- which states an advertisement may move between, who may move it, and what is
-- written down when they do.
--
-- Three things arrive here.
--
-- 1. A THIRD ANSWER. `changes_requested`, added by migration 0008, sends an
--    advertisement back with a message; the advertiser edits and resubmits
--    rather than starting again. Everything that reads or writes that state
--    is here.
--
-- 2. A TRANSITION TABLE, enforced for staff as well. The Phase 6 guard asked
--    "are you staff?" and, if so, allowed anything. That is how an
--    advertisement ends up approved straight from rejected with no record of
--    the reconsideration, or expired without ever having run. The permitted
--    moves are now written down in one function and checked on every update by
--    anyone the guard applies to.
--
-- 3. ONE CALL PER DECISION. PostgREST runs each request in its own
--    transaction, so a note set by one statement is gone before the next one
--    runs. A decision and the sentence explaining it therefore have to be the
--    same statement, which is what `moderate_advertisement()` is. It is also
--    why the moderation actions are not a handful of UPDATEs from the
--    application: an UPDATE that succeeded while its audit entry failed would
--    be exactly the decision nobody can account for.
-- =============================================================================

/*
 * `rejection_reason` now carries the office's message for either decision
 * that sends an advertisement back — a refusal, or a request for a change.
 *
 * The column keeps its name rather than being renamed to something broader,
 * because it is read by the advertiser's own page, by the types and by two
 * test suites, and a rename buys a better noun at the cost of touching all of
 * them. What it holds is stated here instead.
 */
comment on column public.ads.rejection_reason is
  'What the office told the advertiser about this decision. Required for `rejected` and `changes_requested`, and null in every other state.';

alter table public.ads drop constraint if exists ads_rejection_reason_required;
alter table public.ads add constraint ads_rejection_reason_required check (
  case
    when status in ('rejected', 'changes_requested')
      then btrim(coalesce(rejection_reason, '')) <> ''
    else rejection_reason is null
  end
);

-- --------------------------------------------- the transition table ------
/*
 * Every move an advertisement is allowed to make.
 *
 * Read it as a sentence: from the state on the left, to any state on the
 * right. Anything not listed is refused — including for staff, and including
 * moves that look harmless. `expired -> approved` is absent because bringing a
 * finished advertisement back to life is a renewal, which is paid for, and
 * paying for things is Phase 8; the route back is through `pending`, where a
 * human looks at it again.
 *
 * A no-op (status unchanged) is always permitted, or every ordinary edit to a
 * live advertisement would have to be listed here too.
 */
create or replace function public.is_permitted_ad_transition(
  p_from public.ad_status,
  p_to   public.ad_status
)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select p_from = p_to or (p_from, p_to) in (
    ('draft',              'pending'),

    ('pending',            'approved'),
    ('pending',            'rejected'),
    ('pending',            'changes_requested'),
    ('pending',            'draft'),

    -- The advertiser has made the correction and sent it back.
    ('changes_requested',  'pending'),
    ('changes_requested',  'draft'),
    ('changes_requested',  'rejected'),

    -- Unpublishing returns an advertisement to the queue rather than deleting
    -- it: whatever was wrong with it, somebody has to look.
    ('approved',           'pending'),
    ('approved',           'expired'),
    ('approved',           'sold'),
    ('approved',           'rejected'),

    -- "Restore for review". Never straight back to approved: a refusal that
    -- can be undone silently is not a refusal.
    ('rejected',           'pending'),
    ('rejected',           'draft'),

    ('expired',            'pending'),

    ('sold',               'expired'),
    ('sold',               'pending')
  );
$$;

comment on function public.is_permitted_ad_transition(public.ad_status, public.ad_status) is
  'The complete list of moves an advertisement may make. Enforced by guard_ad_moderation() for everyone the guard applies to, staff included.';

-- ------------------------------------------- re-approval after expiry ------
/*
 * Approving an advertisement whose expiry is already in the past has to issue
 * a fresh window, or it is approved and finished in the same breath.
 *
 * The Phase 6 version used `coalesce`, which kept whatever was there — correct
 * for a first approval, wrong for every one after it.
 */
create or replace function public.stamp_ad_publication()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  duration_days int := public.setting_int('ads.default_duration_days', 30);
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    new.published_at := coalesce(new.published_at, now());
    if new.expires_at is null or new.expires_at <= now() then
      new.expires_at := now() + make_interval(days => duration_days);
    end if;
    new.rejection_reason := null;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------- the hardened guard ------
create or replace function public.guard_ad_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  counting_view boolean := coalesce(current_setting('shree.counting_view', true), '') = '1';
  staff         boolean := public.is_staff();
begin
  -- A migration, the SQL editor or the service role. Trusted by definition:
  -- this is the connection that creates the first administrator, before there
  -- is an administrator to authorise it.
  if public.is_trusted_connection() then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and not public.is_permitted_ad_transition(old.status, new.status) then
    raise exception 'An advertisement cannot go from % to %', old.status, new.status
      using errcode = 'insufficient_privilege';
  end if;

  -- The office's message belongs to the two states that carry one, so leaving
  -- either of them clears it. This runs for staff as well as for the
  -- advertiser: a moderator restoring a refused advertisement to the queue
  -- should not have to blank a column to satisfy a constraint, and the
  -- constraint should not be satisfiable by leaving a stale refusal attached
  -- to something that is no longer refused.
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
    -- Lifetime and readership are not the advertiser's to declare.
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

  -- Identity is issued once, by the database.
  new.reference := old.reference;
  new.slug      := old.slug;
  new.kind      := old.kind;

  -- How long an advertisement runs, when it went live, what it cost, and how
  -- many people have seen it.
  new.published_at         := old.published_at;
  new.expires_at           := old.expires_at;
  new.package_price_paise  := old.package_price_paise;
  if not counting_view then
    new.view_count := old.view_count;
  elsif new.view_count is distinct from old.view_count + 1 then
    -- The counter increments by one. Anything else is not the counter.
    new.view_count := old.view_count;
  end if;

  if new.package_id is distinct from old.package_id then
    raise exception 'The package is set when the advertisement is taken'
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * A finished advertisement is the office's to revive.
   *
   * `expired -> pending` and `sold -> pending` are in the transition table
   * because "restore for review" is a real decision — but it is a decision
   * somebody in the office takes. Left open to the owner, editing an expired
   * advertisement would quietly put it back in the queue and, on approval,
   * earn it a fresh run: a renewal without the renewal. The advertiser's own
   * page says as much, and this is what makes that true rather than polite.
   */
  if old.status in ('expired', 'sold') and new.status is distinct from old.status then
    raise exception 'A finished advertisement is restored by Shree Classified, not by its owner'
      using errcode = 'insufficient_privilege';
  end if;

  -- An owner may withdraw, resubmit or mark sold; never self-approve, and
  -- never send their own advertisement back to themselves for changes.
  if new.status is distinct from old.status
     and new.status not in ('draft', 'pending', 'sold')
     and not (new.status = 'expired'
              and old.expires_at is not null
              and old.expires_at <= now()) then
    raise exception 'Only Shree Classified staff can set an advertisement to %', new.status
      using errcode = 'insufficient_privilege';
  end if;

  -- Editing a live advertisement sends it back for review.
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

-- ------------------------------------------------- one call per decision ----
/*
 * The moderation action.
 *
 * SECURITY INVOKER on purpose: row-level security and the guard above still
 * apply, so this function adds a vocabulary and a record, not a privilege. It
 * cannot be used to do anything a moderator could not already do with an
 * UPDATE — what it adds is that the decision and the sentence explaining it
 * arrive in the same transaction, which is the only way the audit trigger can
 * see the note at all.
 *
 * Actions, rather than target states, because "unpublish" and "expire" are
 * different decisions that a bare `status = 'expired'` would not distinguish.
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

  -- A refusal without a reason is not something the advertiser can act on, and
  -- "please make a change" without saying which change is worse than silence.
  if p_action in ('reject', 'request_changes') and note is null then
    raise exception 'A reason is required to % an advertisement', replace(p_action, '_', ' ')
      using errcode = 'check_violation';
  end if;

  if not public.is_permitted_ad_transition(current_status, target_status) then
    raise exception 'An advertisement cannot go from % to %', current_status, target_status
      using errcode = 'insufficient_privilege';
  end if;

  -- Read by audit_ad_change(), below. Transaction-local, and this function is
  -- the whole transaction.
  perform set_config('shree.moderation_note', coalesce(note, ''), true);

  update public.ads
     set status = target_status,
         rejection_reason = case
           when target_status in ('rejected', 'changes_requested') then note
           else null
         end
   where id = p_ad_id;

  perform set_config('shree.moderation_note', '', true);
  return target_status;
end;
$$;

revoke all on function public.moderate_advertisement(uuid, text, text) from public;
grant execute on function public.moderate_advertisement(uuid, text, text) to authenticated;

/*
 * The same shape for a reader's report, and for the same reason: the status
 * and the moderator's note have to reach the audit trail together.
 */
create or replace function public.resolve_ad_report(
  p_report_id uuid,
  p_status    public.report_status,
  p_note      text default null
)
returns public.report_status
language plpgsql
set search_path = public, pg_temp
as $$
declare
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_staff() then
    raise exception 'Only Shree Classified staff can act on a report'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status = 'open' then
    raise exception 'A report cannot be reopened' using errcode = 'check_violation';
  end if;

  perform set_config('shree.moderation_note', coalesce(note, ''), true);

  update public.ad_reports
     set status      = p_status,
         reviewed_by = case when p_status = 'reviewing' then reviewed_by else auth.uid() end,
         reviewed_at = case when p_status = 'reviewing' then reviewed_at else now() end
   where id = p_report_id;

  if not found then
    raise exception 'No such report' using errcode = 'no_data_found';
  end if;

  perform set_config('shree.moderation_note', '', true);
  return p_status;
end;
$$;

revoke all on function public.resolve_ad_report(uuid, public.report_status, text) from public;
grant execute on function public.resolve_ad_report(uuid, public.report_status, text) to authenticated;

-- ------------------------------------------- the note in the audit trail ----
create or replace function public.audit_ad_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  note text := nullif(current_setting('shree.moderation_note', true), '');
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(
      'ad.created', 'advertisement', new.id,
      format('%s submitted as %s', new.reference, new.status),
      null, jsonb_build_object('status', new.status, 'kind', new.kind));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.write_audit(
      'ad.status_changed', 'advertisement', new.id,
      coalesce(note, format('%s moved from %s to %s', new.reference, old.status, new.status)),
      jsonb_build_object('status', old.status, 'rejection_reason', old.rejection_reason),
      jsonb_build_object(
        'status', new.status,
        'rejection_reason', new.rejection_reason,
        'reference', new.reference,
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

  -- What a moderator corrected, as opposed to what they decided. Recorded
  -- separately so "the office edited my advertisement" is answerable, and only
  -- when somebody other than the owner did it.
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
      format('%s edited by the office', new.reference),
      jsonb_build_object('title', old.title, 'description', old.description,
                         'category_id', old.category_id, 'location_id', old.location_id,
                         'price', old.price, 'attributes', old.attributes),
      jsonb_build_object('title', new.title, 'description', new.description,
                         'category_id', new.category_id, 'location_id', new.location_id,
                         'price', new.price, 'attributes', new.attributes));
  end if;

  return new;
end;
$$;

create or replace function public.audit_report_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  note text := nullif(current_setting('shree.moderation_note', true), '');
begin
  if new.status is distinct from old.status then
    perform public.write_audit(
      'report.status_changed', 'report', new.id,
      coalesce(note, format('report moved from %s to %s', old.status, new.status)),
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status, 'note', note, 'ad_id', new.ad_id));
  end if;
  return new;
end;
$$;

-- ----------------------------------------- who reviewed it, permanently ----
/*
 * `reviewed_by` stops being a foreign key.
 *
 * It was `references profiles on delete set null`, which meant that deleting a
 * moderator's account blanked the reviewer on every report they had ever
 * resolved — and, because `ad_reports_reviewed_together` requires the reviewer
 * and the timestamp to be present or absent together, the delete failed
 * outright rather than quietly losing the name. Either outcome is wrong: who
 * resolved a complaint is part of the record, and a record that a departing
 * member of staff can erase by closing their account is not a record.
 *
 * `reporter_id` keeps its ON DELETE SET NULL. That one is a reader, not a
 * decision-maker, and an account they deleted should stop being attached to
 * what they reported.
 */
alter table public.ad_reports drop constraint if exists ad_reports_reviewed_by_fkey;

comment on column public.ad_reports.reviewed_by is
  'The staff account that resolved this report. Deliberately not a foreign key: the record of who decided must outlive the account.';

-- ------------------------------------------------ the moderation history ----
/*
 * `admin_actions` — the audit trail as the office reads it.
 *
 * A view rather than a second table. A separate `admin_actions` table would be
 * a second place for the same facts and a second thing to keep in step, and
 * the one that matters is already append-only at the database level. This just
 * gives it the names a person would use, and the reference number they would
 * quote down the telephone.
 *
 * `security_invoker`, so the audit log's own policy decides who sees it: staff.
 */
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
    l.after  ->> 'note'        as note
  from public.audit_log l
  left join public.profiles actor on actor.id = l.actor_id
  left join public.ads a
    on a.id = l.entity_id and l.entity = 'advertisement';

comment on view public.admin_actions is
  'The audit trail with the actor and the advertisement reference resolved. Read-only, staff-only, and append-only underneath.';

revoke all on public.admin_actions from anon, authenticated;
grant select on public.admin_actions to authenticated;

-- --------------------------------------------------- dashboard counts ------
/*
 * Six numbers in one round trip.
 *
 * Counting by fetching the advertisements and measuring the array is the
 * version of this that works on the first day and falls over in the second
 * year. `count(*) filter (where ...)` is one pass over the index.
 *
 * SECURITY INVOKER: a non-staff caller reads it through their own policies,
 * which show them their own advertisements and no one else's, and the staff
 * check below refuses them anyway.
 */
create or replace function public.admin_dashboard_counts()
returns table (metric text, value bigint)
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'Only Shree Classified staff can read the dashboard'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select * from (
    select 'pending'::text,            count(*) filter (where status = 'pending') from public.ads
    union all
    select 'changes_requested',        count(*) filter (where status = 'changes_requested') from public.ads
    union all
    select 'approved',                 count(*) filter (where status = 'approved' and expires_at > now()) from public.ads
    union all
    select 'rejected',                 count(*) filter (where status = 'rejected') from public.ads
    union all
    select 'expired',                  count(*) filter (where status = 'expired' or (status = 'approved' and expires_at <= now())) from public.ads
    union all
    select 'submitted_today',          count(*) filter (where created_at >= date_trunc('day', now())) from public.ads
    union all
    select 'open_reports',             count(*) filter (where status in ('open', 'reviewing')) from public.ad_reports
    union all
    select 'users',                    count(*) from public.profiles
  ) as counts(metric, value);
end;
$$;

revoke all on function public.admin_dashboard_counts() from public;
grant execute on function public.admin_dashboard_counts() to authenticated;

-- ------------------------------------------------ the review queue view ----
/*
 * `moderation_ads` gains the two things the queue is worked from: how many
 * photographs came with the advertisement, and how long it has been waiting.
 */
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
    extract(epoch from (now() - a.created_at))::bigint / 3600            as hours_waiting
  from public.ads a
  join public.profiles p on p.id = a.user_id
  left join public.categories c on c.id = a.category_id
  left join public.locations  l on l.id = a.location_id
  where public.is_staff();

comment on view public.moderation_ads is
  'Every advertisement, for the review queue, with the advertiser''s contact details. Returns nothing unless the caller is staff. Kept separate from public_ads so that an admin page and a public page can never share a data source by accident.';

revoke all on public.moderation_ads from anon, authenticated;
grant select on public.moderation_ads to authenticated;

-- ------------------------------------------------------ report queue -------
drop view if exists public.moderation_reports;
create view public.moderation_reports
with (security_invoker = true) as
  select
    r.id,
    r.ad_id,
    r.reason,
    r.details,
    r.status,
    r.created_at,
    r.reviewed_at,
    r.reporter_id,
    reporter.full_name as reporter_name,
    reviewer.full_name as reviewer_name,
    a.reference        as ad_reference,
    a.title            as ad_title,
    a.slug             as ad_slug,
    a.status           as ad_status
  from public.ad_reports r
  left join public.profiles reporter on reporter.id = r.reporter_id
  left join public.profiles reviewer on reviewer.id = r.reviewed_by
  left join public.ads a on a.id = r.ad_id;

comment on view public.moderation_reports is
  'The report queue. security_invoker, so ad_reports'' own policy decides: staff see everything, a reader sees only the reports they filed.';

revoke all on public.moderation_reports from anon, authenticated;
grant select on public.moderation_reports to authenticated;

-- ------------------------------------------------------ the user list ------
/*
 * What the office may see about an account, and no more.
 *
 * No password data exists to leak here, but a plain `select * from profiles`
 * in an admin page would grow whatever columns the table grows. This view is
 * the list of things a moderator has a reason to look at, and the count of
 * advertisements is the only one they would otherwise be tempted to compute by
 * fetching everybody's advertisements.
 */
drop view if exists public.admin_users;
create view public.admin_users
with (security_invoker = true) as
  select
    p.id,
    p.full_name,
    p.email,
    p.phone,
    p.role,
    p.is_blocked,
    p.created_at,
    (select count(*) from public.ads a where a.user_id = p.id)::int as ad_count,
    (select count(*) from public.ads a
      where a.user_id = p.id and a.status = 'approved' and a.expires_at > now())::int as live_ad_count,
    (select max(a.created_at) from public.ads a where a.user_id = p.id) as last_submission_at
  from public.profiles p;

comment on view public.admin_users is
  'Accounts as the office needs to see them. security_invoker, so the profiles policy applies: staff see everyone, anybody else sees only themselves.';

revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
