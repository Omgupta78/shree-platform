-- =============================================================================
-- LOCAL VALIDATION ONLY — not applied to Supabase.
--
-- Phase 11. Whether the figures are the right figures.
--
-- An analytics bug does not crash anything. It quietly reports a number that
-- somebody then makes a decision on, which is why these assertions build a
-- known set of rows and check the arithmetic against hand-counted answers
-- rather than against whatever the functions happen to return.
--
-- The definitions being asserted, because they are the substance:
--
--   revenue         PAID payments only, by `paid_at`, in the period
--   approval rate   approved / (approved + rejected + changes_requested),
--                   over decisions MADE in the period
--   renewal rate    denominator is advertisements whose run ENDED in the
--                   period, not every advertisement that exists
--
-- User ids are this file's own — the 4a/4b/4c/4d series.
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

delete from public.test_assertions;
insert into public.test_assertions values (0);

delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data) values
  ('4a000000-0000-4000-8000-000000000001', 'stata@example.com', '{"full_name":"Advertiser A"}'),
  ('4b000000-0000-4000-8000-000000000002', 'statb@example.com', '{"full_name":"Advertiser B"}'),
  ('4c000000-0000-4000-8000-000000000003', 'statmod@example.com', '{"full_name":"Stats Moderator"}'),
  ('4d000000-0000-4000-8000-000000000004', 'statadm@example.com', '{"full_name":"Stats Admin"}');

update public.profiles set role = 'moderator' where id = '4c000000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin'     where id = '4d000000-0000-4000-8000-000000000004';

-- A clean slate, so the counts below are hand-countable.
delete from public.payments;
delete from public.ad_renewals;
delete from public.search_events;
delete from public.ads;

/*
 * A marker, rather than emptying the audit trail.
 *
 * `audit_log` refuses DELETE — it is append-only by trigger, which is the
 * Phase 6 guarantee and not something a test may step around. So the window
 * every assertion below uses starts HERE, after the earlier suites have
 * finished writing to it, and their decisions fall outside it.
 */
select set_config('test.t0', now()::text, false);

update public.packages set price_paise = 19900 where id = 'basic';
update public.packages set price_paise = 49900 where id = 'standard';

-- =========================================================================
-- 1. Nobody but staff sees a single figure
-- =========================================================================
set role authenticated;
select set_config('test.uid', '4a000000-0000-4000-8000-000000000001', false);

do $$
begin
  begin
    perform * from public.analytics_overview(current_setting('test.t0')::timestamptz, now());
    raise exception 'FAIL: an advertiser read the business overview';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot read the business overview');
  end;

  begin
    perform * from public.analytics_by_package(current_setting('test.t0')::timestamptz, now());
    raise exception 'FAIL: an advertiser read revenue by package';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot read revenue by package');
  end;

  begin
    perform * from public.analytics_moderators(current_setting('test.t0')::timestamptz, now());
    raise exception 'FAIL: an advertiser read the moderators'' figures';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot read who decided what');
  end;

  begin
    perform * from public.analytics_search(current_setting('test.t0')::timestamptz, now());
    raise exception 'FAIL: an advertiser read the search log';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot read the search log');
  end;

  begin
    perform 1 from public.search_events;
    raise exception 'FAIL: an advertiser read the search table directly';
  exception when insufficient_privilege then
    perform public.ok('the search table is unreadable without going through the functions');
  end;
end $$;

-- =========================================================================
-- 2. A known set of advertisements
-- =========================================================================
reset role;
select set_config('test.uid', '', false);

do $$
declare
  cat uuid := (select id from public.categories where slug = 'property');
  cat2 uuid := (select id from public.categories where slug = 'vehicles');
  loc uuid := (select id from public.locations  where slug = 'roorkee');
begin
  -- Five submitted: three property, two vehicles. One is a draft and must
  -- never be counted as a submission.
  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, status, package_id)
  values
    ('4a000000-0000-4000-8000-000000000001', cat,  loc, 'Stats A one',   'Not a real advertisement.', 100, 'fixed', 'Advertiser A', '9000000041', 'pending', 'basic'),
    ('4a000000-0000-4000-8000-000000000001', cat,  loc, 'Stats A two',   'Not a real advertisement.', 200, 'fixed', 'Advertiser A', '9000000041', 'pending', 'standard'),
    ('4a000000-0000-4000-8000-000000000001', cat,  loc, 'Stats A three', 'Not a real advertisement.', 300, 'fixed', 'Advertiser A', '9000000041', 'pending', 'basic'),
    ('4b000000-0000-4000-8000-000000000002', cat2, loc, 'Stats B one',   'Not a real advertisement.', 400, 'fixed', 'Advertiser B', '9000000042', 'pending', 'basic'),
    ('4b000000-0000-4000-8000-000000000002', cat2, loc, 'Stats B draft', 'Not a real advertisement.', 500, 'fixed', 'Advertiser B', '9000000042', 'draft',   'basic');
end $$;

do $$
declare r record;
begin
  select * into r from public.analytics_overview(current_setting('test.t0')::timestamptz, now() + interval '1 day');
  assert r.ads_created = 4, format('ads_created was %s, expected 4 (the draft is not a submission)', r.ads_created);
  perform public.ok('a draft is not counted as an advertisement anybody sent us');

  assert r.ads_pending = 4, format('ads_pending was %s, expected 4', r.ads_pending);
  assert r.revenue_paise = 0 and r.payments_paid = 0;
  assert r.average_value_paise is null,
    'the average transaction value was zero rather than absent when nothing was paid';
  perform public.ok('with no payments the average is absent, not ₹0.00');
end $$;

-- =========================================================================
-- 3. Decisions, and what an approval rate actually divides by
-- =========================================================================
set role authenticated;
select set_config('test.uid', '4c000000-0000-4000-8000-000000000003', false);
select public.moderate_advertisement(public.test_ad_id('Stats A one'), 'approve');
select public.moderate_advertisement(public.test_ad_id('Stats A two'), 'approve');
select public.moderate_advertisement(public.test_ad_id('Stats A three'), 'reject', 'Not suitable.');

reset role;
select set_config('test.uid', '', false);
do $$
declare
  r   record;
  m   record;
begin
  select * into r from public.analytics_overview(current_setting('test.t0')::timestamptz, now() + interval '1 day');
  assert r.decisions_made = 3, format('decisions_made was %s, expected 3', r.decisions_made);
  assert r.decisions_approved = 2, format('decisions_approved was %s, expected 2', r.decisions_approved);
  perform public.ok('an approval rate divides by decisions made, not by everything ever submitted');

  -- One advertisement is still waiting. It belongs in neither half.
  assert r.ads_pending = 1, format('ads_pending was %s, expected 1', r.ads_pending);
  perform public.ok('an advertisement nobody has read yet is in neither half of the rate');

  select * into m from public.analytics_moderation(current_setting('test.t0')::timestamptz, now() + interval '1 day');
  assert m.decided_total = 3 and m.approved = 2 and m.rejected = 1;
  assert m.changes_requested = 0;
  assert m.awaiting_review = 1;
  perform public.ok('the moderation figures agree with the overview');

  assert m.median_hours is not null and m.median_hours >= 0,
    'no turnaround was measured for decisions that were made';
  perform public.ok('turnaround is measured from submission to the first decision');
end $$;

do $$
declare n int; r record;
begin
  select count(*) into n from public.analytics_moderators(current_setting('test.t0')::timestamptz, now() + interval '1 day');
  assert n = 1, format('%s moderators were listed, expected 1', n);

  select * into r from public.analytics_moderators(current_setting('test.t0')::timestamptz, now() + interval '1 day');
  assert r.decisions = 3 and r.approved = 2 and r.rejected = 1;
  assert r.moderator_name = 'Stats Moderator';
  perform public.ok('decisions are attributed to the moderator who made them, by name only');
end $$;

-- =========================================================================
-- 4. Revenue counts settled payments, and nothing else
-- =========================================================================
do $$
declare
  ad1 uuid := public.test_ad_id('Stats A one');
  ad2 uuid := public.test_ad_id('Stats A two');
  ad3 uuid := public.test_ad_id('Stats B one');
  r   record;
begin
  -- One paid basic, one paid standard, one failed, one still open.
  insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
  values (ad1, '4a000000-0000-4000-8000-000000000001', 'basic', 1, 'razorpay', 'order_stat_1');
  perform public.settle_payment('razorpay', 'order_stat_1', 'pay_stat_1', 'sig', 19900);

  insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
  values (ad2, '4a000000-0000-4000-8000-000000000001', 'standard', 1, 'razorpay', 'order_stat_2');
  perform public.settle_payment('razorpay', 'order_stat_2', 'pay_stat_2', 'sig', 49900);

  insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
  values (ad3, '4b000000-0000-4000-8000-000000000002', 'basic', 1, 'razorpay', 'order_stat_3');
  perform public.close_payment('razorpay', 'order_stat_3', 'failed', 'Card declined.');

  insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
  values (public.test_ad_id('Stats A three'), '4a000000-0000-4000-8000-000000000001',
          'basic', 1, 'razorpay', 'order_stat_4');

  select * into r from public.analytics_overview(current_setting('test.t0')::timestamptz, now() + interval '1 day');

  assert r.revenue_paise = 69800,
    format('revenue was %s paise, expected 19900 + 49900 = 69800', r.revenue_paise);
  perform public.ok('revenue is the sum of settled payments only');

  assert r.payments_paid = 2, format('payments_paid was %s, expected 2', r.payments_paid);
  assert r.payments_attempted = 4,
    format('payments_attempted was %s, expected all 4 attempts', r.payments_attempted);
  perform public.ok('a failed and an unfinished attempt count as attempts, never as revenue');

  assert r.average_value_paise = 34900,
    format('the average was %s paise, expected 69800 / 2', r.average_value_paise);
  perform public.ok('average transaction value divides revenue by settled payments');
end $$;

do $$
declare
  basic    record;
  standard record;
  n        int;
begin
  select count(*) into n from public.analytics_by_package(current_setting('test.t0')::timestamptz, now() + interval '1 day');
  assert n = 2, format('%s packages had revenue, expected 2', n);

  select * into basic from public.analytics_by_package(current_setting('test.t0')::timestamptz, now() + interval '1 day')
   where package_id = 'basic';
  select * into standard from public.analytics_by_package(current_setting('test.t0')::timestamptz, now() + interval '1 day')
   where package_id = 'standard';

  assert basic.purchases = 1 and basic.revenue_paise = 19900;
  assert standard.purchases = 1 and standard.revenue_paise = 49900;
  perform public.ok('revenue by package attributes each payment to the package it bought');

  -- Renaming a package must not break last month's figures.
  update public.packages set name = 'Basic Plus' where id = 'basic';
  select * into basic from public.analytics_by_package(current_setting('test.t0')::timestamptz, now() + interval '1 day')
   where package_id = 'basic';
  assert basic.package_name = 'Basic Plus' and basic.revenue_paise = 19900;
  perform public.ok('renaming a package keeps its revenue, under the new name');
  update public.packages set name = 'Basic' where id = 'basic';
end $$;

-- A period with nothing in it reports nothing, rather than today's numbers.
do $$
declare r record;
begin
  select * into r from public.analytics_overview(
    now() - interval '400 days', now() - interval '300 days');
  assert r.revenue_paise = 0 and r.payments_paid = 0 and r.ads_created = 0;
  assert r.average_value_paise is null;
  perform public.ok('a period with no activity reports no activity');
end $$;

-- =========================================================================
-- 5. Categories and places
-- =========================================================================
do $$
declare
  property record;
  vehicles record;
begin
  select * into property from public.analytics_by_category(current_setting('test.t0')::timestamptz, now() + interval '1 day')
   where category_name = 'Property';
  select * into vehicles from public.analytics_by_category(current_setting('test.t0')::timestamptz, now() + interval '1 day')
   where category_name = 'Vehicles';

  assert property.ads_created = 3, format('property had %s advertisements, expected 3', property.ads_created);
  assert vehicles.ads_created = 1, format('vehicles had %s advertisements, expected 1 (the draft is not one)', vehicles.ads_created);
  perform public.ok('advertisements are counted under their own category, drafts excluded');

  assert property.revenue_paise = 69800,
    format('property revenue was %s, expected both payments', property.revenue_paise);
  assert vehicles.revenue_paise = 0,
    format('vehicles revenue was %s, expected 0 — its only payment failed', vehicles.revenue_paise);
  perform public.ok('a failed payment adds nothing to its category''s revenue');
end $$;

do $$
declare r record;
begin
  select * into r from public.analytics_by_location(current_setting('test.t0')::timestamptz, now() + interval '1 day')
   where location_name = 'Roorkee';
  assert r.ads_created = 4, format('Roorkee had %s advertisements, expected 4', r.ads_created);
  perform public.ok('advertisements are counted by place, in aggregate');
end $$;

-- =========================================================================
-- 6. Renewals, and what a renewal rate divides by
-- =========================================================================
reset role;
select set_config('test.uid', '', false);
-- `now()`, not `now() - 1 minute`: the window starts at test.t0, which is
-- seconds old, so a minute ago falls outside it and the run would look as
-- though it had ended before anybody was watching.
update public.ads set expires_at = now()
 where title in ('Stats A one', 'Stats A two');
select public.expire_advertisements();

set role authenticated;
select set_config('test.uid', '4a000000-0000-4000-8000-000000000001', false);
select public.request_renewal(public.test_ad_id('Stats A one'), 'basic');

reset role;
select set_config('test.uid', '', false);
do $$
declare
  r record;
  o record;
begin
  select * into r from public.analytics_renewals(current_setting('test.t0')::timestamptz, now() + interval '1 day');
  assert r.requested = 1, format('%s renewals were requested, expected 1', r.requested);
  assert r.renewed_late = 1 and r.renewed_early = 0,
    'the renewal was not recorded as one asked for after the run had ended';
  perform public.ok('renewals are told apart by whether the run had already ended');

  select * into o from public.analytics_overview(current_setting('test.t0')::timestamptz, now() + interval '1 day');
  assert o.ads_became_eligible = 2,
    format('%s advertisements became eligible, expected the 2 whose runs ended', o.ads_became_eligible);
  perform public.ok('a renewal rate divides by the advertisements whose runs actually ended');

  -- The point of that denominator: it is not the total.
  assert o.ads_became_eligible < o.ads_created,
    'the eligible count equalled everything created, which would make the rate meaningless';
  perform public.ok('the eligible count is not simply every advertisement that exists');
end $$;

-- =========================================================================
-- 7. Search: recorded anonymously, and the zero-result half
-- =========================================================================
do $$
declare
  cat uuid := (select id from public.categories where slug = 'property');
  r   record;
  n   int;
begin
  perform public.record_search('property in roorkee', 12, cat);
  perform public.record_search('property in roorkee', 9, cat);
  perform public.record_search('PROPERTY IN ROORKEE', 9, cat);   -- same search, shouted
  perform public.record_search('  tractor  ', 0, null);
  perform public.record_search('tractor', 0, null);
  perform public.record_search('a', 3, null);                     -- one letter: not a search
  perform public.record_search('', 3, null);

  select count(*) into n from public.search_events;
  assert n = 5, format('%s searches were recorded, expected 5', n);
  perform public.ok('a blank or single-letter search is not recorded');

  select * into r from public.analytics_search(current_setting('test.t0')::timestamptz, now() + interval '1 day')
   where term = 'property in roorkee';
  assert r.searches = 3, format('"property in roorkee" was counted %s times, expected 3', r.searches);
  assert r.zero_result = 0;
  perform public.ok('the same search shouted in capitals is the same search');

  select * into r from public.analytics_search(current_setting('test.t0')::timestamptz, now() + interval '1 day')
   where term = 'tractor';
  assert r.searches = 2 and r.zero_result = 2;
  perform public.ok('surrounding spaces do not make a different search term');
  perform public.ok('searches that found nothing are counted, which is the useful half');
end $$;

do $$
declare cols int;
begin
  -- Nothing about the person who searched. Asserted against the schema rather
  -- than trusted, because this is the column somebody would add later.
  select count(*) into cols from information_schema.columns
   where table_name = 'search_events'
     and column_name in ('user_id', 'ip', 'ip_address', 'session_id', 'user_agent');
  assert cols = 0, 'the search log has grown a column identifying who searched';
  perform public.ok('the search log records what was searched for, never who searched');
end $$;

do $$
declare
  gone int;
  left_over int;
begin
  update public.search_events set created_at = now() - interval '200 days' where term = 'tractor';
  gone := public.prune_search_events();
  assert gone = 2, format('the sweep removed %s old searches, expected 2', gone);
  select count(*) into left_over from public.search_events;
  assert left_over = 3;
  perform public.ok('old searches are pruned, so the log does not grow for ever');
end $$;

-- =========================================================================
-- 8. The series, and the funnel
-- =========================================================================
do $$
declare
  n     int;
  total bigint;
begin
  select count(*) into n from public.analytics_timeseries(
    date_trunc('day', now()) - interval '6 days', date_trunc('day', now()) + interval '1 day', 'day');
  assert n = 7, format('the series had %s buckets, expected 7 days', n);
  perform public.ok('a seven-day range produces seven buckets, including empty ones');

  select coalesce(sum(t.revenue_paise), 0) into total
    from public.analytics_timeseries(
      date_trunc('day', now()) - interval '6 days',
      date_trunc('day', now()) + interval '1 day', 'day') t;
  assert total = 69800,
    format('the series totalled %s paise, expected the same 69800 as the overview', total);
  perform public.ok('the chart and the headline figure agree');
end $$;

do $$
declare f record;
begin
  select * into f from public.analytics_funnel(current_setting('test.t0')::timestamptz, now() + interval '1 day');
  assert f.posted = 2, format('%s people posted, expected 2', f.posted);
  perform public.ok('the funnel counts people, not advertisements');

  assert f.paid = 1, format('%s people paid, expected 1', f.paid);
  assert f.paid <= f.posted, 'more people paid than posted, which cannot be true';
  perform public.ok('each step of the funnel is a subset of the one above it');
end $$;

-- =========================================================================
-- 9. Top advertisements use recorded views, and claim nothing else
-- =========================================================================
do $$
declare
  ad  uuid := public.test_ad_id('Stats A one');
  r   record;
  cols int;
begin
  update public.ads set view_count = 42 where id = ad;

  select * into r from public.analytics_top_ads(current_setting('test.t0')::timestamptz, now() + interval '1 day')
   where ad_id = ad;
  assert r.views = 42, format('the top list reported %s views, expected the recorded 42', r.views);
  perform public.ok('the top list reports the view count that was actually recorded');

  -- Nothing counts a tap on a telephone number, so no such column exists.
  select count(*) into cols from information_schema.routines r2
    join information_schema.parameters p on p.specific_name = r2.specific_name
   where r2.routine_name = 'analytics_top_ads' and p.parameter_name ilike '%contact%';
  assert cols = 0;
  perform public.ok('there is no "most contacted" figure, because nothing records a contact');
end $$;

-- =========================================================================
-- 10. Staff can read all of it
-- =========================================================================
set role authenticated;
select set_config('test.uid', '4d000000-0000-4000-8000-000000000004', false);
do $$
declare r record;
begin
  select * into r from public.analytics_overview(current_setting('test.t0')::timestamptz, now() + interval '1 day');
  assert r.revenue_paise = 69800;
  perform public.ok('an administrator reads the figures');
end $$;

select set_config('test.uid', '4c000000-0000-4000-8000-000000000003', false);
do $$
declare n int;
begin
  select count(*) into n from public.analytics_by_category(current_setting('test.t0')::timestamptz, now() + interval '1 day');
  assert n >= 2;
  perform public.ok('a moderator reads the figures too');
end $$;

reset role;
do $$
declare n int;
begin
  select t.n into n from public.test_assertions t;
  raise notice '% assertions passed.', n;
end $$;

\echo ''
