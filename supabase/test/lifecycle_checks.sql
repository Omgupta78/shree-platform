-- =============================================================================
-- LOCAL VALIDATION ONLY — not applied to Supabase.
--
-- Phase 8. The lifecycle: how long a run lasts, what ends it, how it is
-- renewed, and who may change any of that.
--
-- User ids are this file's own — the 1a/1b/1c/1d series. Advertiser A, advertiser
-- B, a moderator and an administrator.
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

delete from public.test_assertions;
insert into public.test_assertions values (0);

create or replace function public.test_ad_slug(p_title text)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$ select slug from public.ads where title = p_title order by created_at limit 1 $$;
grant execute on function public.test_ad_slug(text) to public;

delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data) values
  ('1a000000-0000-4000-8000-000000000001', 'usera@example.com', '{"full_name":"Advertiser A"}'),
  ('1b000000-0000-4000-8000-000000000002', 'userb@example.com', '{"full_name":"Advertiser B"}'),
  ('1c000000-0000-4000-8000-000000000003', 'mod3@example.com',  '{"full_name":"Lifecycle Moderator"}'),
  ('1d000000-0000-4000-8000-000000000004', 'adm3@example.com',  '{"full_name":"Lifecycle Admin"}');

update public.profiles set role = 'moderator' where id = '1c000000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin'     where id = '1d000000-0000-4000-8000-000000000004';

-- Two submissions from A and one from B, entered by a trusted connection.
do $$
declare
  cat uuid := (select id from public.categories where slug = 'property');
  loc uuid := (select id from public.locations  where slug = 'roorkee');
begin
  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, status, package_id)
  values
    ('1a000000-0000-4000-8000-000000000001', cat, loc, 'Lifecycle A first flat',
     'A flat used only by the lifecycle checks. Not a real advertisement.',
     8000, 'fixed', 'Advertiser A', '9000000011', 'pending', 'basic'),
    ('1a000000-0000-4000-8000-000000000001', cat, loc, 'Lifecycle A second shop',
     'A shop used only by the lifecycle checks. Not a real advertisement.',
     9000, 'fixed', 'Advertiser A', '9000000011', 'pending', 'basic'),
    ('1b000000-0000-4000-8000-000000000002', cat, loc, 'Lifecycle B plot',
     'A plot used only by the lifecycle checks. Not a real advertisement.',
     500000, 'fixed', 'Advertiser B', '9000000012', 'pending', 'standard');
end $$;

-- =========================================================================
-- 1. Approval issues a run, from the package, on the server
-- =========================================================================
set role authenticated;
select set_config('test.uid', '1c000000-0000-4000-8000-000000000003', false);

do $$
declare
  ad uuid := public.test_ad_id('Lifecycle A first flat');
  r  record;
  run int := public.package_duration_days('basic');
begin
  assert run = public.setting_int('ads.default_duration_days', 30),
    'a package with no duration of its own should use the site default';
  perform public.ok('a package with no duration uses the configured default');

  perform public.moderate_advertisement(ad, 'approve');
  select status, published_at, expires_at into r from public.ads where id = ad;
  assert r.status = 'approved' and r.published_at between now() - interval '1 minute' and now(),
    'approval did not set published_at to the approval time';
  assert r.expires_at = r.published_at + make_interval(days => run),
    format('expiry %s is not publication plus %s days', r.expires_at, run);
  perform public.ok('approval sets published_at now and expires_at from the package duration');

  assert pg_typeof(r.expires_at)::text = 'timestamp with time zone',
    'expiry must be stored with its time zone';
  perform public.ok('lifecycle timestamps are timezone-aware');

  perform public.moderate_advertisement(public.test_ad_id('Lifecycle A second shop'), 'approve');
  perform public.moderate_advertisement(public.test_ad_id('Lifecycle B plot'), 'approve');
end $$;

-- A package's own duration wins, and the setting is the only other source.
reset role;
select set_config('test.uid', '', false);
update public.packages set duration_days = 45 where id = 'standard';
do $$
begin
  assert public.package_duration_days('standard') = 45;
  assert public.package_duration_days('no-such-package') = public.setting_int('ads.default_duration_days', 30);
  perform public.ok('a configured package duration is used, and nothing else invents one');
end $$;
update public.packages set duration_days = null where id = 'standard';

-- =========================================================================
-- 2. The advertiser cannot set their own run, status or package
-- =========================================================================
set role authenticated;
select set_config('test.uid', '1a000000-0000-4000-8000-000000000001', false);

do $$
declare
  ad  uuid := public.test_ad_id('Lifecycle A first flat');
  was timestamptz := (select expires_at from public.ads where id = ad);
begin
  update public.ads set expires_at = now() + interval '5 years' where id = ad;
  assert (select expires_at from public.ads where id = ad) = was,
    'the advertiser moved their own expiry date';
  perform public.ok('an advertiser cannot move their own expiry date');

  update public.ads set published_at = now() + interval '1 year' where id = ad;
  assert (select published_at from public.ads where id = ad) < now() + interval '1 day';
  perform public.ok('an advertiser cannot move their own publication date');

  begin
    update public.ads set package_id = 'premium' where id = ad;
    raise exception 'FAIL: the advertiser changed their own package';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot change their package outside a renewal');
  end;

  begin
    perform public.extend_advertisement_expiry(ad, now() + interval '60 days', 'I want longer');
    raise exception 'FAIL: an advertiser extended their own run';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot extend their own run');
  end;

  begin
    perform public.moderate_advertisement(ad, 'expire', 'done');
    raise exception 'FAIL: an advertiser used the office''s expire action';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot use the office''s expire action');
  end;

  begin
    perform public.approve_renewal(gen_random_uuid());
    raise exception 'FAIL: an advertiser approved a renewal';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot approve a renewal');
  end;

  begin
    perform public.expire_advertisements();
    raise exception 'FAIL: an advertiser ran the expiry sweep';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot run the expiry sweep');
  end;

  begin
    insert into public.ad_renewals (ad_id, user_id, renewal_number, package_id, timing)
    values (ad, auth.uid(), 99, 'basic', 'early');
    raise exception 'FAIL: an advertiser wrote a renewal row directly';
  exception when insufficient_privilege then
    perform public.ok('renewal rows cannot be written directly');
  end;
end $$;

-- =========================================================================
-- 3. Renewal: when it is allowed, and whose it is
-- =========================================================================
do $$
declare ad uuid := public.test_ad_id('Lifecycle A first flat');
begin
  begin
    perform public.request_renewal(ad, 'basic');
    raise exception 'FAIL: a renewal was accepted a month before expiry';
  exception when check_violation then
    perform public.ok('a live advertisement is not renewable before the expiring-soon window');
  end;

  begin
    perform public.request_renewal(public.test_ad_id('Lifecycle B plot'), 'basic');
    raise exception 'FAIL: A renewed B''s advertisement';
  exception when no_data_found then
    perform public.ok('advertiser A cannot renew advertiser B''s advertisement (and is told it does not exist)');
  end;
end $$;

-- Bring A's first flat into the expiring-soon window, and end A's shop.
reset role;
select set_config('test.uid', '', false);
update public.ads set expires_at = now() + interval '3 days'
 where id = public.test_ad_id('Lifecycle A first flat');
update public.ads set expires_at = now() - interval '1 hour'
 where id = public.test_ad_id('Lifecycle A second shop');

-- The public stops seeing the shop the moment its date passes, before any sweep.
set role anon;
do $$
begin
  assert not exists (select 1 from public.public_ads where title = 'Lifecycle A second shop'),
    'a lapsed advertisement was still public before the sweep';
  assert exists (select 1 from public.public_ads where title = 'Lifecycle A first flat');
  perform public.ok('an advertisement past its expiry is not public, sweep or no sweep');
end $$;
reset role;

-- =========================================================================
-- 4. The sweep is idempotent
-- =========================================================================
do $$
declare
  first  int;
  second int;
  events int;
  ad uuid := public.test_ad_id('Lifecycle A second shop');
begin
  first  := public.expire_advertisements();
  second := public.expire_advertisements();
  assert first = 1, format('the sweep expired %s advertisements, expected 1', first);
  assert second = 0, format('the second sweep expired %s more', second);
  perform public.ok('the expiry sweep retires what has ended, and a second run finds nothing');

  select count(*) into events from public.audit_log
   where entity_id = ad and action = 'ad.status_changed' and after ->> 'status' = 'expired';
  assert events = 1, format('%s expiry events were written for one expiry', events);
  assert (select after ->> 'event' from public.audit_log
           where entity_id = ad and action = 'ad.status_changed' and after ->> 'status' = 'expired') = 'expired_automatically';
  perform public.ok('repeated sweeps write exactly one lifecycle event, named expired_automatically');

  assert (select status from public.ads where id = ad) = 'expired';
  assert exists (select 1 from public.ads where id = ad and reference is not null and published_at is not null);
  perform public.ok('an expired advertisement keeps its row, reference and publication history');
end $$;

-- The expired URL tells the public only what it may know.
set role anon;
do $$
declare s record;
begin
  select * into s from public.expired_ad_stub(public.test_ad_slug('Lifecycle A second shop'));
  assert s.title = 'Lifecycle A second shop' and s.ended_at < now(),
    'the expired advertisement''s public stub was not returned';
  perform public.ok('an expired advertisement''s URL resolves to a stub for the public');

  assert not exists (select 1 from public.expired_ad_stub(public.test_ad_slug('Lifecycle A first flat'))),
    'a live advertisement answered as expired';
  perform public.ok('a live advertisement never answers as expired');
end $$;
reset role;

-- =========================================================================
-- 5. Early renewal: stays live, extends the run on approval
-- =========================================================================
set role authenticated;
select set_config('test.uid', '1a000000-0000-4000-8000-000000000001', false);

do $$
declare
  ad  uuid := public.test_ad_id('Lifecycle A first flat');
  rid uuid;
begin
  begin
    perform public.request_renewal(ad, 'gold-plated');
    raise exception 'FAIL: an unknown package was accepted';
  exception when check_violation then
    perform public.ok('an unknown package is refused');
  end;

  rid := public.request_renewal(ad, 'basic');
  assert (select status from public.ads where id = ad) = 'approved',
    'an early renewal took a live advertisement down';
  assert (select timing from public.ad_renewals where id = rid) = 'early';
  perform public.ok('an early renewal leaves the advertisement live while it is reviewed');

  begin
    perform public.request_renewal(ad, 'basic');
    raise exception 'FAIL: a second renewal was accepted while one was waiting';
  exception when check_violation then
    perform public.ok('a second renewal is refused while one is waiting');
  end;

  assert (select count(*) from public.ad_renewals) = 1,
    'advertiser A can see renewals that are not theirs';
end $$;

select set_config('test.uid', '1b000000-0000-4000-8000-000000000002', false);
do $$
begin
  assert (select count(*) from public.ad_renewals) = 0, 'B can see A''s renewal';
  perform public.ok('an advertiser cannot see another advertiser''s renewal history');
end $$;

select set_config('test.uid', '1c000000-0000-4000-8000-000000000003', false);
do $$
declare
  ad   uuid := public.test_ad_id('Lifecycle A first flat');
  was  timestamptz := (select expires_at from public.ads where id = ad);
  rid  uuid := (select id from public.ad_renewals where ad_id = ad and status = 'pending');
  got  timestamptz;
  r    record;
begin
  got := public.approve_renewal(rid, 'Renewed early.');
  assert got = was + make_interval(days => public.package_duration_days('basic')),
    format('early renewal ran to %s, expected %s plus the package run', got, was);
  select * into r from public.ad_renewals where id = rid;
  assert r.status = 'approved' and r.new_expires_at = got and r.decided_by = auth.uid()
     and r.previous_expires_at = was;
  perform public.ok('approving an early renewal extends from the current expiry and records it');

  begin
    perform public.approve_renewal(rid);
    raise exception 'FAIL: a renewal was approved twice';
  exception when check_violation then
    perform public.ok('an already-decided renewal cannot be approved again');
  end;
end $$;

-- =========================================================================
-- 6. Renewal after expiry: back through the queue, then a fresh run
-- =========================================================================
select set_config('test.uid', '1a000000-0000-4000-8000-000000000001', false);
do $$
declare
  ad  uuid := public.test_ad_id('Lifecycle A second shop');
  rid uuid;
begin
  rid := public.request_renewal(ad, 'standard');
  assert (select status from public.ads where id = ad) = 'pending',
    'renewing an expired advertisement did not send it to review';
  assert (select package_id from public.ads where id = ad) = 'standard';
  assert not exists (select 1 from public.public_ads where id = ad);
  perform public.ok('renewing an expired advertisement sends it to review, not straight back to live');
  assert (select previous_expires_at from public.ad_renewals where id = rid) < now();
  perform public.ok('the renewal remembers the previous run');
end $$;

select set_config('test.uid', '1c000000-0000-4000-8000-000000000003', false);
do $$
declare
  ad  uuid := public.test_ad_id('Lifecycle A second shop');
  r   record;
  rn  record;
begin
  -- The ordinary Approve button settles the renewal too.
  perform public.moderate_advertisement(ad, 'approve');
  select status, published_at, expires_at into r from public.ads where id = ad;
  assert r.status = 'approved' and r.published_at > now() - interval '1 minute'
     and r.expires_at = r.published_at + make_interval(days => public.package_duration_days('standard'));
  perform public.ok('approving a renewed advertisement publishes a fresh run from the new package');

  select * into rn from public.ad_renewals where ad_id = ad;
  assert rn.status = 'approved' and rn.new_expires_at = r.expires_at and rn.new_published_at = r.published_at;
  perform public.ok('the renewal is closed with the new publication and expiry dates');

  assert (select reference from public.ads where id = ad) is not null
     and (select count(*) from public.ads where title = 'Lifecycle A second shop') = 1;
  perform public.ok('a renewal keeps the same advertisement and reference');

  assert exists (select 1 from public.admin_actions where entity_id = ad and event = 'renewal_requested');
  assert exists (select 1 from public.admin_actions where entity_id = ad and action = 'ad.renewal_approved');
  perform public.ok('renewal requested and renewal approved are on the advertisement''s history');
end $$;

-- Refusing a renewal of a finished advertisement refuses it, with the reason.
reset role;
select set_config('test.uid', '', false);
update public.ads set expires_at = now() - interval '1 minute'
 where id = public.test_ad_id('Lifecycle B plot');
select public.expire_advertisements();

set role authenticated;
select set_config('test.uid', '1b000000-0000-4000-8000-000000000002', false);
select public.request_renewal(public.test_ad_id('Lifecycle B plot'), 'basic');

select set_config('test.uid', '1c000000-0000-4000-8000-000000000003', false);
do $$
declare
  ad  uuid := public.test_ad_id('Lifecycle B plot');
  rid uuid := (select id from public.ad_renewals where ad_id = ad and status = 'pending');
begin
  begin
    perform public.reject_renewal(rid, '  ');
    raise exception 'FAIL: a renewal was refused without a reason';
  exception when check_violation then
    perform public.ok('refusing a renewal needs a reason');
  end;
  perform public.reject_renewal(rid, 'The plot has been sold, per the office.');
  assert (select status from public.ad_renewals where id = rid) = 'rejected';
  assert (select status from public.ads where id = ad) = 'rejected';
  assert (select decision_note from public.ad_renewals where id = rid) like 'The plot%';
  perform public.ok('a refused renewal is recorded with its reason, and nothing is deleted');
end $$;

-- =========================================================================
-- 7. Administrator overrides
-- =========================================================================
do $$
declare ad uuid := public.test_ad_id('Lifecycle A first flat');
begin
  begin
    perform public.extend_advertisement_expiry(ad, now() + interval '90 days', 'Office goodwill');
    raise exception 'FAIL: a moderator extended an expiry';
  exception when insufficient_privilege then
    perform public.ok('a moderator cannot extend an expiry — administrators only');
  end;
  begin
    perform public.moderate_advertisement(ad, 'expire', 'Complaint upheld');
    raise exception 'FAIL: a moderator manually expired an advertisement';
  exception when insufficient_privilege then
    perform public.ok('a moderator cannot manually expire — administrators only');
  end;
end $$;

select set_config('test.uid', '1d000000-0000-4000-8000-000000000004', false);
do $$
declare
  ad  uuid := public.test_ad_id('Lifecycle A first flat');
  was timestamptz := (select expires_at from public.ads where id = ad);
begin
  begin
    perform public.extend_advertisement_expiry(ad, was + interval '10 days', '');
    raise exception 'FAIL: an extension was accepted without a reason';
  exception when check_violation then
    perform public.ok('an extension needs a reason');
  end;
  begin
    perform public.extend_advertisement_expiry(ad, was - interval '1 day', 'Shorter');
    raise exception 'FAIL: an "extension" shortened the run';
  exception when check_violation then
    perform public.ok('an extension must be later than the current expiry');
  end;
  begin
    perform public.extend_advertisement_expiry(ad, now() + interval '5 years', 'Forever');
    raise exception 'FAIL: an extension beyond the ceiling was accepted';
  exception when check_violation then
    perform public.ok('an extension is capped by ads.max_extension_days');
  end;

  perform public.extend_advertisement_expiry(ad, was + interval '10 days', 'Printed edition was delayed.');
  assert (select expires_at from public.ads where id = ad) = was + interval '10 days';
  assert exists (select 1 from public.admin_actions
                  where entity_id = ad and action = 'ad.expiry_extended'
                    and note = 'Printed edition was delayed.'
                    and (before ->> 'expires_at')::timestamptz = was);
  perform public.ok('an administrator can extend a live run, and the old and new dates are audited');

  begin
    perform public.moderate_advertisement(ad, 'expire');
    raise exception 'FAIL: a manual expiry was accepted without a reason';
  exception when check_violation then
    perform public.ok('marking as expired needs a reason');
  end;

  perform public.moderate_advertisement(ad, 'expire', 'Advertiser asked us to take it down.');
  assert (select status from public.ads where id = ad) = 'expired';
  assert exists (select 1 from public.admin_actions
                  where entity_id = ad and event = 'expired_manually'
                    and previous_status = 'approved' and new_status = 'expired'
                    and actor_name = 'Lifecycle Admin'
                    and note = 'Advertiser asked us to take it down.');
  perform public.ok('a manual expiry records the admin, both statuses and the reason');

  begin
    perform public.extend_advertisement_expiry(ad, now() + interval '30 days', 'Bring it back');
    raise exception 'FAIL: an expired advertisement was extended back to life';
  exception when check_violation then
    perform public.ok('an expired advertisement cannot be extended — it must be renewed');
  end;
end $$;

-- =========================================================================
-- 8. Counts
-- =========================================================================
do $$
declare n bigint;
begin
  select value into n from public.admin_dashboard_counts() where metric = 'renewals_pending';
  assert n = 0, format('renewals_pending is %s', n);
  select value into n from public.admin_dashboard_counts() where metric = 'expiring_soon';
  assert n = 0, format('expiring_soon is %s', n);
  perform public.ok('the dashboard counts renewals waiting and advertisements expiring soon');
end $$;

-- =========================================================================
reset role;
select set_config('test.uid', '', false);

do $$
declare n int;
begin
  select t.n into n from public.test_assertions t;
  raise notice '% assertions passed.', n;
end $$;

\echo ''
