-- =============================================================================
-- Shree Classified — Phase 11: what the business actually did
--
-- Every figure the analytics pages show is computed here, in SQL, and every
-- function refuses anyone who is not staff. Two reasons, and the second is the
-- one that matters:
--
--   * Aggregation belongs where the rows are. A dashboard that fetches a
--     year of advertisements into a browser to count them works until the
--     year it does not.
--   * Authorisation belongs where the data is. `/admin/analytics` is behind
--     the proxy and the admin layout, but those are a better experience
--     rather than the security — an ordinary account calling these functions
--     directly is refused by the function itself.
--
-- WHAT IS DELIBERATELY ABSENT, because the events are not recorded:
--
--   * Contact clicks. Nothing counts a tap on "Call" or "WhatsApp", so there
--     is no "most contacted advertisement" here. The interface says the
--     figure is not recorded rather than showing a plausible number.
--   * Page response times and API error rates. Those are the hosting
--     platform's to report, not this database's, and inventing them from
--     nothing would be worse than their absence.
--
-- Views ARE recorded — `record_ad_view()` has incremented `ads.view_count`
-- since Phase 6 — and favourites are a table, so both appear.
--
-- Every boundary is a timestamptz computed by the caller. Grouping by day
-- converts with `at time zone 'Asia/Kolkata'` rather than by adding hours to
-- a number, which is the arithmetic that breaks twice a year in countries
-- that observe daylight saving and reads as "roughly right" in ours.
-- =============================================================================

-- =========================================================================
-- Search, which was not recorded at all
-- =========================================================================
/*
 * What people looked for, and whether they found anything.
 *
 * Deliberately anonymous: no user id, no address, no session. Knowing that
 * eleven people searched for "scooty" last week is a fact about the market.
 * Knowing WHO searched for it is a fact about a person, and it is not needed
 * to decide whether the paper wants a scooters section.
 *
 * `result_count` is what makes the zero-result report possible, which is the
 * genuinely useful half: it says what readers came for and did not find.
 */
create table if not exists public.search_events (
  id           bigint generated always as identity primary key,
  -- Normalised by `record_search()`: trimmed, folded to lower case, and cut
  -- to 80 characters. Long enough for a real search, short enough that a
  -- pasted paragraph cannot become a row nobody can read.
  term         text not null check (char_length(term) between 1 and 80),
  result_count integer not null check (result_count >= 0),
  category_id  uuid references public.categories (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.search_events is
  'What was searched for and how many results it found. No user, no address, no session — a fact about the market, not about a person.';

create index if not exists search_events_recent_idx on public.search_events (created_at desc);
create index if not exists search_events_term_idx on public.search_events (term, created_at desc);
create index if not exists search_events_empty_idx
  on public.search_events (term, created_at desc) where result_count = 0;

/*
 * Recording one.
 *
 * Callable by anyone, including a signed-out reader, because searching is
 * something signed-out readers do and a search log that only covers
 * registered users describes the wrong population. There is nothing to abuse:
 * the row holds a string and a number, and the retention sweep removes it.
 */
create or replace function public.record_search(
  p_term         text,
  p_result_count integer,
  p_category_id  uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cleaned text := lower(btrim(coalesce(p_term, '')));
begin
  -- A blank search is a page view, not a search. A single character is a
  -- keystroke on the way to one.
  if char_length(cleaned) < 2 then return; end if;

  insert into public.search_events (term, result_count, category_id)
  values (left(cleaned, 80), greatest(coalesce(p_result_count, 0), 0), p_category_id);
end;
$$;

grant execute on function public.record_search(text, integer, uuid) to anon, authenticated;

/*
 * Retention.
 *
 * A search log kept for ever is a growing table nobody reads the old end of.
 * Ninety days is long enough to see a season and short enough that the table
 * stays small; it is a setting rather than a constant so the office can
 * change its mind without a deployment.
 */
insert into public.app_settings (key, value, description) values
  ('analytics.search_retention_days', '90'::jsonb,
   'How long an anonymous search record is kept before the sweep removes it.')
on conflict (key) do nothing;

create or replace function public.prune_search_events()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  keep int := public.setting_int('analytics.search_retention_days', 90);
  gone int;
begin
  if not (public.is_trusted_connection() or public.is_staff()) then
    raise exception 'Only Shree Classified can prune the search log'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.search_events where created_at < now() - make_interval(days => keep);
  get diagnostics gone = row_count;
  return gone;
end;
$$;

revoke all on function public.prune_search_events() from public, anon, authenticated;
grant execute on function public.prune_search_events() to authenticated, service_role;

alter table public.search_events enable row level security;
-- Insert goes through `record_search()`, which is SECURITY DEFINER. Reading is
-- staff business and goes through the analytics functions below. So: no
-- policies, and no grants.
revoke all on table public.search_events from anon, authenticated;

-- =========================================================================
-- One gate, for every figure
-- =========================================================================
/*
 * One gate, called first by every function below.
 *
 * Staff, or a trusted connection — the same pair `expire_advertisements()`
 * admits, and for the same reason: the service role already bypasses row-level
 * security entirely, so refusing it here would protect nothing while stopping
 * a scheduled report from ever being written. An ordinary signed-in account
 * always carries a uid and is never a trusted connection, so this is exactly
 * the refusal Phase 11 asks for.
 */
create or replace function public.require_analytics_reader()
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if not (public.is_staff() or public.is_trusted_connection()) then
    raise exception 'Analytics are for Shree Classified staff'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- =========================================================================
-- The figures
-- =========================================================================
/*
 * The headline numbers, with their definitions written down.
 *
 * These definitions are the substance of the whole phase — a dashboard whose
 * approval rate is "approved divided by everything ever submitted" is a
 * dashboard that reports a falling approval rate every time somebody posts an
 * advertisement nobody has read yet.
 *
 *   revenue_paise      sum of PAID payments settled in the period. Failed,
 *                      cancelled and still-open attempts are excluded; a
 *                      refund is excluded from revenue and counted separately.
 *   payments_paid      how many of those there were.
 *   average_value      revenue / payments_paid. Null rather than zero when
 *                      there were none, so the interface can say "no payments"
 *                      instead of "₹0.00 average".
 *   ads_created        advertisements submitted in the period, drafts excluded
 *                      — a draft is not a submission.
 *   ads_live           advertisements approved and not past their date RIGHT
 *                      NOW. Deliberately not period-bounded: "how many are
 *                      live" is a question about today.
 *   users_new          accounts created in the period.
 *   approval_rate      approved / (approved + rejected + changes_requested),
 *                      over decisions MADE in the period. Advertisements still
 *                      waiting are not in either half.
 */
create or replace function public.analytics_overview(p_from timestamptz, p_to timestamptz)
returns table (
  ads_created          bigint,
  ads_live             bigint,
  ads_pending          bigint,
  ads_expired          bigint,
  users_total          bigint,
  users_new            bigint,
  revenue_paise        bigint,
  payments_paid        bigint,
  payments_attempted   bigint,
  average_value_paise  bigint,
  refunded_paise       bigint,
  decisions_made       bigint,
  decisions_approved   bigint,
  renewals_requested   bigint,
  renewals_approved    bigint,
  ads_became_eligible  bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  with decisions as (
    select a.entity_id, a.after ->> 'status' as status
      from public.audit_log a
     where a.action = 'ad.status_changed'
       and a.entity = 'advertisement'
       and a.occurred_at >= p_from and a.occurred_at < p_to
       and a.after ->> 'status' in ('approved', 'rejected', 'changes_requested')
  ),
  paid as (
    select p.amount_paise from public.payments p
     where p.status = 'paid' and p.paid_at >= p_from and p.paid_at < p_to
  )
  select
    (select count(*) from public.ads
      where status <> 'draft' and created_at >= p_from and created_at < p_to),
    (select count(*) from public.ads
      where status = 'approved' and expires_at > now()),
    (select count(*) from public.ads where status = 'pending'),
    (select count(*) from public.ads where status = 'expired'),
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where created_at >= p_from and created_at < p_to),
    (select coalesce(sum(amount_paise), 0)::bigint from paid),
    (select count(*) from paid),
    (select count(*) from public.payments
      where created_at >= p_from and created_at < p_to),
    (select case when count(*) = 0 then null
                 else (sum(amount_paise) / count(*))::bigint end from paid),
    (select coalesce(sum(amount_paise), 0)::bigint from public.payments
      where status = 'refunded' and updated_at >= p_from and updated_at < p_to),
    (select count(*) from decisions),
    (select count(*) from decisions where status = 'approved'),
    (select count(*) from public.ad_renewals
      where requested_at >= p_from and requested_at < p_to),
    (select count(*) from public.ad_renewals
      where status = 'approved' and decided_at >= p_from and decided_at < p_to),
    -- The denominator for the renewal rate: advertisements whose run ENDED in
    -- the period, which is what makes one eligible to be renewed. Dividing by
    -- every advertisement instead would report a renewal rate that falls as
    -- the business grows.
    --
    -- Deliberately NOT filtered by current status. An advertisement that
    -- expired and was then renewed is back at `pending` — filtering on status
    -- would drop precisely the advertisements that took the renewal up, which
    -- removes them from the denominator and reports a renewal rate higher
    -- than the truth. `published_at` is the filter instead: a run can only
    -- end if it started.
    (select count(*) from public.ads
      where expires_at >= p_from and expires_at < p_to
        and published_at is not null);
end;
$$;

/*
 * Everything that moves over time, in one pass.
 *
 * One function rather than four, because the four charts share an x-axis and
 * four separate queries would each rebuild the same series of dates — and
 * could disagree about which days exist when one of them has no rows.
 *
 * `p_grain` is 'day' or 'month'. The caller picks it from the length of the
 * range: ninety days of daily points is a readable chart, three years of them
 * is a smear.
 */
create or replace function public.analytics_timeseries(
  p_from  timestamptz,
  p_to    timestamptz,
  p_grain text default 'day'
)
returns table (
  bucket        date,
  ads_created   bigint,
  ads_published bigint,
  payments_paid bigint,
  revenue_paise bigint,
  users_new     bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  step interval := case when p_grain = 'month' then interval '1 month' else interval '1 day' end;
  unit text     := case when p_grain = 'month' then 'month' else 'day' end;
begin
  perform public.require_analytics_reader();

  return query
  with series as (
    select date_trunc(unit, g at time zone 'Asia/Kolkata')::date as bucket
      from generate_series(p_from, p_to - interval '1 microsecond', step) as g
  ),
  created as (
    select date_trunc(unit, created_at at time zone 'Asia/Kolkata')::date as bucket, count(*) as n
      from public.ads
     where status <> 'draft' and created_at >= p_from and created_at < p_to
     group by 1
  ),
  published as (
    select date_trunc(unit, published_at at time zone 'Asia/Kolkata')::date as bucket, count(*) as n
      from public.ads
     where published_at >= p_from and published_at < p_to
     group by 1
  ),
  settled as (
    select date_trunc(unit, paid_at at time zone 'Asia/Kolkata')::date as bucket,
           count(*) as n, sum(amount_paise) as paise
      from public.payments
     where status = 'paid' and paid_at >= p_from and paid_at < p_to
     group by 1
  ),
  joined as (
    select date_trunc(unit, created_at at time zone 'Asia/Kolkata')::date as bucket, count(*) as n
      from public.profiles
     where created_at >= p_from and created_at < p_to
     group by 1
  )
  select s.bucket,
         coalesce(c.n, 0)::bigint,
         coalesce(p.n, 0)::bigint,
         coalesce(t.n, 0)::bigint,
         coalesce(t.paise, 0)::bigint,
         coalesce(j.n, 0)::bigint
    from series s
    left join created   c on c.bucket = s.bucket
    left join published p on p.bucket = s.bucket
    left join settled   t on t.bucket = s.bucket
    left join joined    j on j.bucket = s.bucket
   order by s.bucket;
end;
$$;

/*
 * By package.
 *
 * Joined to `packages` for the name, but falling back to the snapshot the
 * payment carries — so a package renamed or taken off sale still appears
 * under the name it was sold as, and a deleted one does not vanish from last
 * year's revenue.
 */
create or replace function public.analytics_by_package(p_from timestamptz, p_to timestamptz)
returns table (
  package_id    text,
  package_name  text,
  purchases     bigint,
  revenue_paise bigint,
  average_paise bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  select p.package_id,
         coalesce(pk.name, p.package_name, p.package_id),
         count(*)::bigint,
         sum(p.amount_paise)::bigint,
         (sum(p.amount_paise) / count(*))::bigint
    from public.payments p
    left join public.packages pk on pk.id = p.package_id
   where p.status = 'paid' and p.paid_at >= p_from and p.paid_at < p_to
   group by p.package_id, coalesce(pk.name, p.package_name, p.package_id)
   order by sum(p.amount_paise) desc, count(*) desc;
end;
$$;

/*
 * By category, and by place.
 *
 * Revenue is attributed to the category of the advertisement the payment was
 * raised against. That is a real number and it is labelled "revenue by
 * category" rather than "most profitable category" — profit would need costs,
 * and this database has never seen one.
 */
create or replace function public.analytics_by_category(p_from timestamptz, p_to timestamptz)
returns table (
  category_id   uuid,
  category_name text,
  ads_created   bigint,
  ads_live      bigint,
  revenue_paise bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  select c.id, c.name,
         count(a.id) filter (
           where a.status <> 'draft' and a.created_at >= p_from and a.created_at < p_to
         )::bigint,
         count(a.id) filter (where a.status = 'approved' and a.expires_at > now())::bigint,
         coalesce(sum(pay.amount_paise), 0)::bigint
    from public.categories c
    left join public.ads a on a.category_id = c.id
    left join public.payments pay
           on pay.ad_id = a.id and pay.status = 'paid'
          and pay.paid_at >= p_from and pay.paid_at < p_to
   group by c.id, c.name
  having count(a.id) filter (
           where a.status <> 'draft' and a.created_at >= p_from and a.created_at < p_to
         ) > 0
      or count(a.id) filter (where a.status = 'approved' and a.expires_at > now()) > 0
   order by 3 desc, 4 desc;
end;
$$;

create or replace function public.analytics_by_location(p_from timestamptz, p_to timestamptz)
returns table (
  location_id   uuid,
  location_name text,
  location_kind public.location_kind,
  ads_created   bigint,
  ads_live      bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  select l.id, l.name, l.kind,
         count(a.id) filter (
           where a.status <> 'draft' and a.created_at >= p_from and a.created_at < p_to
         )::bigint,
         count(a.id) filter (where a.status = 'approved' and a.expires_at > now())::bigint
    from public.locations l
    join public.ads a on a.location_id = l.id
   group by l.id, l.name, l.kind
  having count(a.id) > 0
   order by 4 desc, 5 desc;
end;
$$;

/*
 * The office's own performance.
 *
 * Turnaround is measured from when an advertisement was submitted to when it
 * was first decided, using the audit trail rather than the advertisement's
 * current state — an advertisement approved, unpublished and approved again
 * has one submission and several decisions, and only the first one measures
 * how long somebody waited.
 *
 * Moderator names are included because a queue is worked by people and the
 * office knows who they are. Nothing else about them is: no email, no
 * telephone number, no account detail.
 */
create or replace function public.analytics_moderation(p_from timestamptz, p_to timestamptz)
returns table (
  decided_total      bigint,
  approved           bigint,
  rejected           bigint,
  changes_requested  bigint,
  awaiting_review    bigint,
  median_hours       numeric,
  average_hours      numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  with first_decision as (
    select distinct on (l.entity_id)
           l.entity_id, l.occurred_at, l.after ->> 'status' as status
      from public.audit_log l
     where l.action = 'ad.status_changed' and l.entity = 'advertisement'
       and l.after ->> 'status' in ('approved', 'rejected', 'changes_requested')
       and l.occurred_at >= p_from and l.occurred_at < p_to
     order by l.entity_id, l.occurred_at
  ),
  waited as (
    select d.status,
           extract(epoch from (d.occurred_at - a.created_at)) / 3600.0 as hours
      from first_decision d
      join public.ads a on a.id = d.entity_id
     where d.occurred_at >= a.created_at
  )
  select (select count(*) from waited),
         (select count(*) from waited where status = 'approved'),
         (select count(*) from waited where status = 'rejected'),
         (select count(*) from waited where status = 'changes_requested'),
         (select count(*) from public.ads where status = 'pending'),
         (select round(percentile_cont(0.5) within group (order by hours)::numeric, 1) from waited),
         (select round(avg(hours)::numeric, 1) from waited);
end;
$$;

create or replace function public.analytics_moderators(p_from timestamptz, p_to timestamptz)
returns table (
  moderator_id   uuid,
  moderator_name text,
  decisions      bigint,
  approved       bigint,
  rejected       bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  select l.actor_id,
         coalesce(p.full_name, 'Removed account'),
         count(*)::bigint,
         count(*) filter (where l.after ->> 'status' = 'approved')::bigint,
         count(*) filter (where l.after ->> 'status' = 'rejected')::bigint
    from public.audit_log l
    left join public.profiles p on p.id = l.actor_id
   where l.action = 'ad.status_changed' and l.entity = 'advertisement'
     and l.actor_id is not null
     and l.after ->> 'status' in ('approved', 'rejected', 'changes_requested')
     and l.occurred_at >= p_from and l.occurred_at < p_to
   group by l.actor_id, coalesce(p.full_name, 'Removed account')
   order by 3 desc;
end;
$$;

/*
 * Renewals, and the rate.
 *
 * `timing` is already recorded by Phase 8 as 'early' or 'after_expiry', so
 * "renewed before expiry" and "renewed after it lapsed" are read rather than
 * inferred from dates.
 */
create or replace function public.analytics_renewals(p_from timestamptz, p_to timestamptz)
returns table (
  requested      bigint,
  approved       bigint,
  rejected       bigint,
  still_pending  bigint,
  renewed_early  bigint,
  renewed_late   bigint,
  paid_renewals  bigint,
  expiring_soon  bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  soon int := public.setting_int('ads.expiring_soon_days', 7);
begin
  perform public.require_analytics_reader();

  return query
  select (select count(*) from public.ad_renewals
           where requested_at >= p_from and requested_at < p_to),
         (select count(*) from public.ad_renewals
           where status = 'approved' and decided_at >= p_from and decided_at < p_to),
         (select count(*) from public.ad_renewals
           where status = 'rejected' and decided_at >= p_from and decided_at < p_to),
         (select count(*) from public.ad_renewals where status = 'pending'),
         (select count(*) from public.ad_renewals
           where timing = 'early' and requested_at >= p_from and requested_at < p_to),
         (select count(*) from public.ad_renewals
           where timing = 'after_expiry' and requested_at >= p_from and requested_at < p_to),
         (select count(*) from public.payments
           where purpose = 'renewal' and status = 'paid'
             and paid_at >= p_from and paid_at < p_to),
         -- Not period-bounded: "how many end soon" is a question about now.
         (select count(*) from public.ads
           where status = 'approved' and expires_at > now()
             and expires_at <= now() + make_interval(days => soon));
end;
$$;

/*
 * What readers looked for.
 *
 * Two halves, and the second is the useful one: the terms that found nothing
 * are what the office does not sell yet.
 */
create or replace function public.analytics_search(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit integer default 20
)
returns table (
  term        text,
  searches    bigint,
  zero_result bigint,
  last_seen   timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  select s.term,
         count(*)::bigint,
         count(*) filter (where s.result_count = 0)::bigint,
         max(s.created_at)
    from public.search_events s
   where s.created_at >= p_from and s.created_at < p_to
   group by s.term
   order by count(*) desc, max(s.created_at) desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

/*
 * The advertisements readers actually looked at.
 *
 * `view_count` has been incremented by `record_ad_view()` since Phase 6, so
 * this is a recorded number rather than an estimate. Favourites are a table.
 * There is no "most contacted" column, because nothing counts a tap on the
 * telephone number — and a column of plausible figures would be worse than
 * its absence.
 */
create or replace function public.analytics_top_ads(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit integer default 10
)
returns table (
  ad_id       uuid,
  reference   text,
  title       text,
  category    text,
  views       integer,
  favourites  bigint,
  status      public.ad_status,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  select a.id, a.reference, a.title, c.name, a.view_count,
         (select count(*) from public.favourites f where f.ad_id = a.id)::bigint,
         a.status, a.published_at
    from public.ads a
    left join public.categories c on c.id = a.category_id
   where a.published_at >= p_from and a.published_at < p_to
   order by a.view_count desc, a.published_at desc
   limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;

/*
 * The funnel.
 *
 * Each step counts DISTINCT accounts that reached it, so somebody with four
 * advertisements is one person who posted, not four. The steps are nested —
 * everybody who paid also posted — which is what makes the drop between them
 * mean anything.
 */
create or replace function public.analytics_funnel(p_from timestamptz, p_to timestamptz)
returns table (
  registered     bigint,
  posted         bigint,
  paid           bigint,
  published      bigint,
  renewed        bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  select (select count(*) from public.profiles
           where created_at >= p_from and created_at < p_to),
         (select count(distinct user_id) from public.ads
           where status <> 'draft' and created_at >= p_from and created_at < p_to),
         (select count(distinct user_id) from public.payments
           where status = 'paid' and paid_at >= p_from and paid_at < p_to),
         (select count(distinct user_id) from public.ads
           where published_at >= p_from and published_at < p_to),
         (select count(distinct user_id) from public.ad_renewals
           where requested_at >= p_from and requested_at < p_to);
end;
$$;

-- =========================================================================
-- Indexes the above actually need
-- =========================================================================
/*
 * Only what is missing. `ads (status, created_at)`, `ads (category_id)`,
 * `ads (location_id)`, `ads (expires_at)` and `audit_log (entity, entity_id,
 * occurred_at)` already exist from earlier phases and cover most of this.
 */

-- Revenue by day groups on `paid_at` filtered to settled payments. The Phase 9
-- index is on (status, created_at), which does not serve it.
create index if not exists payments_settled_idx
  on public.payments (paid_at) where status = 'paid';

-- The moderation turnaround reads status changes by time across all
-- advertisements; the existing index leads with entity_id, so it cannot.
create index if not exists audit_log_status_changes_idx
  on public.audit_log (occurred_at)
  where action = 'ad.status_changed';

-- Registration trend and the funnel's first step.
create index if not exists profiles_joined_idx on public.profiles (created_at);

-- Publication trend, and the top-advertisements list.
create index if not exists ads_published_idx on public.ads (published_at)
  where published_at is not null;

-- =========================================================================
-- Grants
-- =========================================================================
/*
 * Every analytics function refuses a non-staff caller in its own body. EXECUTE
 * is granted to `authenticated` rather than revoked because staff ARE
 * authenticated users — the refusal is the role check inside, which is the one
 * that cannot be got around by finding another route to the function.
 */
grant execute on function public.analytics_overview(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_timeseries(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.analytics_by_package(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_by_category(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_by_location(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_moderation(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_moderators(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_renewals(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_search(timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.analytics_top_ads(timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.analytics_funnel(timestamptz, timestamptz) to authenticated;
