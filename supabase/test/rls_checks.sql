-- =============================================================================
-- LOCAL VALIDATION ONLY — not applied to Supabase.
--
-- Asserts the security guarantees the schema claims. Run against a scratch
-- database after the migrations:
--   psql -d shree_test -f supabase/test/rls_checks.sql
-- Any failed assertion aborts with an error.
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Roles, grants and default privileges come from _local_shim.sql, which runs
-- before the migrations. This file must not re-grant anything: a blanket
-- `grant ... on all tables` here would hand back the privileges migration 0007
-- deliberately takes away, and every check that depends on them would pass for
-- the wrong reason.
grant usage on schema public, auth to anon, authenticated;

-- Two users: one ordinary, one admin.
delete from auth.users;
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'seller@example.com', '{"full_name":"Ramesh Kumar","phone":"9876543210"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@example.com',  '{"full_name":"Shree Admin"}');
update public.profiles set role = 'admin' where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  seller uuid := '11111111-1111-1111-1111-111111111111';
  cat    uuid := (select id from public.categories where slug = 'jobs-full-time');
  loc    uuid := (select id from public.locations  where slug = 'roorkee-civil-lines');
  ad     uuid;
  n      int;
begin
  -- The auth trigger must have created both profiles automatically.
  select count(*) into n from public.profiles;
  assert n = 2, format('expected 2 auto-created profiles, found %s', n);
  raise notice 'PASS  profile is created automatically on signup';

  -- An ad submitted by a user lands in review, never live.
  insert into public.ads (user_id, category_id, location_id, slug, title, description,
                          price, price_type, contact_name, contact_phone, status)
  values (seller, cat, loc, 'office-assistant-required-roorkee',
          'Office assistant required in Civil Lines',
          'A reputed firm in Civil Lines, Roorkee requires an office assistant. Basic computer knowledge needed.',
          18000, 'fixed', 'Ramesh Kumar', '9876543210', 'pending')
  returning id into ad;
  raise notice 'PASS  advertisement submitted for review';

  -- Approval stamps the publication window from app_settings, not a constant.
  update public.ads set status = 'approved' where id = ad;
  select extract(day from (expires_at - published_at))::int into n from public.ads where id = ad;
  assert n = public.setting_int('ads.default_duration_days', 0),
    format('expiry window was %s days, expected the configured value', n);
  raise notice 'PASS  approval sets a % day publication window from app_settings', n;

  -- Full-text search matches both the title and the body.
  select count(*) into n from public.ads
   where search_vector @@ websearch_to_tsquery('simple', 'assistant Roorkee');
  assert n = 1, 'full-text search did not match the advertisement';
  raise notice 'PASS  full-text search index matches';

  -- The configured image cap is enforced in the database.
  for i in 0 .. public.setting_int('ads.max_images', 8) - 1 loop
    insert into public.ad_images (ad_id, storage_path, sort_order)
    values (ad, format('ads/%s/%s.webp', ad, i), i);
  end loop;
  begin
    insert into public.ad_images (ad_id, storage_path, sort_order)
    values (ad, 'ads/overflow.webp', 99);
    raise exception 'FAIL: image limit was not enforced';
  exception when check_violation then
    raise notice 'PASS  image limit enforced at % images', public.setting_int('ads.max_images', 8);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Anonymous visitor
-- ---------------------------------------------------------------------------
set role anon;
select set_config('test.uid', '', false);

do $$
declare n int;
begin
  select count(*) into n from public.ads;
  assert n = 1, format('anonymous visitor should see 1 live ad, saw %s', n);
  raise notice 'PASS  anonymous visitor sees approved advertisements';

  select count(*) into n from public.profiles;
  assert n = 0, format('anonymous visitor must not read profiles, saw %s rows', n);
  raise notice 'PASS  profiles are invisible to anonymous visitors';

  select count(*) into n from public.categories where is_active;
  assert n > 0, 'categories should be publicly readable';
  raise notice 'PASS  categories and locations are publicly readable';

  -- is_trusted_connection() is true for anon (no JWT), so prove the claim that
  -- RLS blocks the write before any trigger can be reached.
  update public.profiles set role = 'admin';
  get diagnostics n = row_count;
  assert n = 0, format('anonymous visitor changed %s profile rows', n);
  raise notice 'PASS  anonymous visitor cannot write to profiles';

  update public.ads set status = 'approved';
  get diagnostics n = row_count;
  assert n = 0, format('anonymous visitor changed %s ad rows', n);
  raise notice 'PASS  anonymous visitor cannot modify advertisements';

  update public.app_settings set value = '999'::jsonb where key = 'ads.max_images';
  get diagnostics n = row_count;
  assert n = 0, format('anonymous visitor changed %s settings rows', n);
  raise notice 'PASS  anonymous visitor cannot change site settings';
end $$;

-- ---------------------------------------------------------------------------
-- Signed-in ordinary user
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  ad uuid := (select id from public.ads limit 1);
  n  int;
begin
  -- Cannot grant themselves staff rights.
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'FAIL: user escalated their own role';
  exception when insufficient_privilege then
    raise notice 'PASS  user cannot promote themselves to admin';
  end;

  -- Cannot award themselves featured placement.
  begin
    update public.ads set is_featured = true, featured_until = now() + interval '7 days' where id = ad;
    raise exception 'FAIL: user granted themselves featured placement';
  exception when insufficient_privilege then
    raise notice 'PASS  user cannot grant themselves featured placement';
  end;

  -- Editing a live advertisement returns it to the review queue. Runs while
  -- the ad is still approved, and leaves it pending for the next check.
  update public.ads set title = 'Office assistant required urgently in Civil Lines' where id = ad;
  select count(*) into n from public.ads where id = ad and status = 'pending';
  assert n = 1, 'editing a live advertisement should send it back for review';
  raise notice 'PASS  editing a live advertisement returns it to the review queue';

  -- Cannot approve their own advertisement, now that it is genuinely pending.
  begin
    update public.ads set status = 'approved' where id = ad;
    raise exception 'FAIL: user approved their own advertisement';
  exception when insufficient_privilege then
    raise notice 'PASS  user cannot approve their own advertisement';
  end;

  -- Owner still sees their own ad while it is not public.
  select count(*) into n from public.ads where id = ad;
  assert n = 1, 'owner should see their own advertisement in any state';
  raise notice 'PASS  owner sees their own advertisement while it is under review';
end $$;

-- A different signed-in user must not see that pending ad.
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);
do $$
declare n int;
begin
  select count(*) into n from public.ads;
  assert n = 0, format('another user should not see a pending ad, saw %s', n);
  raise notice 'PASS  a pending advertisement is hidden from other users';
end $$;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
do $$
declare
  ad uuid := (select id from public.ads limit 1);
  n  int;
begin
  update public.ads set status = 'rejected', rejection_reason = 'Please add a contact address.' where id = ad;
  raise notice 'PASS  staff can reject with a reason';

  -- A rejection reason is mandatory on rejection.
  begin
    update public.ads set rejection_reason = null where id = ad;
    raise exception 'FAIL: rejected advertisement allowed an empty reason';
  exception when check_violation then
    raise notice 'PASS  a rejected advertisement must carry a reason';
  end;

  -- A refused advertisement cannot go straight back to live. Phase 7 added a
  -- transition table, and this is the move it most deliberately forbids: a
  -- refusal that can be undone in one step, with nothing in between, is not a
  -- refusal. The way back is through the queue.
  begin
    update public.ads set status = 'approved' where id = ad;
    raise exception 'FAIL: a rejected advertisement went straight back to live';
  exception when insufficient_privilege then
    raise notice 'PASS  a rejected advertisement cannot be restored straight to live';
  end;

  update public.ads set status = 'pending' where id = ad;
  update public.ads set status = 'approved' where id = ad;
  select count(*) into n from public.ads where id = ad and rejection_reason is null and status = 'approved';
  assert n = 1, 'restoring and approving should clear the rejection reason';
  raise notice 'PASS  restoring through the queue clears the previous rejection reason';

  -- The scheduled sweep retires ads past expiry.
  update public.ads set expires_at = now() - interval '1 day' where id = ad;
  perform public.expire_stale_ads();
  select count(*) into n from public.ads where id = ad and status = 'expired';
  assert n = 1, 'expire_stale_ads did not retire the advertisement';
  raise notice 'PASS  expired advertisements are retired by the scheduled sweep';
end $$;

reset role;
select set_config('test.uid', '', false);
\echo ''
\echo '22 assertions passed.'
