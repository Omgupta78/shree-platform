-- Local end-to-end fixture. Applied after _local_shim.sql and every migration.
-- Nothing here is a real advertisement, person or telephone number; every
-- title says "Harness" so a stray screenshot can never be mistaken for one.

-- PostgREST connects as `authenticator` and switches to anon / authenticated
-- per request, exactly as on Supabase.
do $$ begin create role authenticator login noinherit; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;

-- On Supabase, auth.uid() reads the verified JWT that PostgREST places in
-- `request.jwt.claims`. The SQL suites set `test.uid` instead; both work.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('test.uid', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  )
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-000000000001', 'admin@shree.test',      '{"full_name":"Office Admin"}'),
  ('a2000000-0000-4000-8000-000000000002', 'moderator@shree.test',  '{"full_name":"Office Moderator"}'),
  ('a3000000-0000-4000-8000-000000000003', 'advertiser@shree.test', '{"full_name":"Test Advertiser"}');

-- Roles are granted by a trusted connection, as they would be from the SQL
-- editor. There is no interface for this, on purpose.
update public.profiles set role = 'admin'     where id = 'a1000000-0000-4000-8000-000000000001';
update public.profiles set role = 'moderator' where id = 'a2000000-0000-4000-8000-000000000002';

do $$
declare
  owner uuid := 'a3000000-0000-4000-8000-000000000003';
  property uuid := (select id from public.categories where slug = 'property');
  vehicles uuid := (select id from public.categories where slug = 'vehicles');
  education uuid := (select id from public.categories where slug = 'education');
  business uuid := (select id from public.categories where slug = 'business');
  roorkee uuid := (select id from public.locations where slug = 'roorkee');
  haridwar uuid := (select id from public.locations where slug = 'haridwar');
  approved_ad uuid;
begin
  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, show_phone, status, package_id, created_at)
  values
    (owner, property, roorkee, 'Harness pending flat to approve',
     'A two room flat used only by the local test harness. It is not a real advertisement.',
     9000, 'fixed', 'Test Advertiser', '9000000001', true, 'pending', 'basic', now() - interval '3 hours'),
    (owner, vehicles, haridwar, 'Harness pending scooter to reject',
     'A scooter listing used only by the local test harness. It is not a real advertisement.',
     25000, 'negotiable', 'Test Advertiser', '9000000001', true, 'pending', 'basic', now() - interval '2 hours'),
    (owner, education, roorkee, 'Harness pending tuition to send back',
     'A tuition listing used only by the local test harness. It is not a real advertisement.',
     null, 'on_call', 'Test Advertiser', '9000000001', false, 'pending', 'basic', now() - interval '1 hour');

  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, show_phone, status, package_id,
                          published_at, expires_at)
  values (owner, business, haridwar, 'Harness approved shop listing',
          'A shop listing used only by the local test harness. It is not a real advertisement.',
          15000, 'fixed', 'Test Advertiser', '9000000001', true, 'approved', 'basic',
          now() - interval '2 days', now() + interval '28 days')
  returning id into approved_ad;

  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, show_phone, status, rejection_reason, package_id)
  values (owner, property, roorkee, 'Harness rejected plot listing',
          'A plot listing used only by the local test harness. It is not a real advertisement.',
          500000, 'fixed', 'Test Advertiser', '9000000001', true, 'rejected',
          'Incomplete information', 'basic');

  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, show_phone, status, package_id,
                          published_at, expires_at)
  values (owner, vehicles, roorkee, 'Harness expired bicycle listing',
          'A bicycle listing used only by the local test harness. It is not a real advertisement.',
          3000, 'fixed', 'Test Advertiser', '9000000001', true, 'expired', 'basic',
          now() - interval '40 days', now() - interval '10 days');

  -- Lifecycle fixtures (Phase 8).
  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, show_phone, status, package_id,
                          published_at, expires_at)
  values
    (owner, property, roorkee, 'Harness expiring flat listing',
     'A flat listing used only by the local test harness. It is not a real advertisement.',
     7000, 'fixed', 'Test Advertiser', '9000000001', true, 'approved', 'basic',
     now() - interval '27 days', now() + interval '3 days'),
    (owner, business, roorkee, 'Harness lapsed sofa listing',
     'A sofa listing used only by the local test harness. It is not a real advertisement.',
     2000, 'fixed', 'Test Advertiser', '9000000001', true, 'approved', 'basic',
     now() - interval '30 days', now() - interval '2 hours'),
    (owner, business, haridwar, 'Harness long run office listing',
     'An office listing used only by the local test harness. It is not a real advertisement.',
     20000, 'fixed', 'Test Advertiser', '9000000001', true, 'approved', 'basic',
     now() - interval '10 days', now() + interval '20 days');

  insert into public.ad_reports (ad_id, reason, details)
  values (approved_ad, 'incorrect', 'Harness report: the price looks wrong.');
end $$;
