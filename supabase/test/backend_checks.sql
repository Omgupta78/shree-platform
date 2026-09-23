-- =============================================================================
-- LOCAL VALIDATION ONLY — not applied to Supabase.
--
-- Phase 6. Every claim the backend makes, written as something that fails if
-- the claim stops being true.
--
-- Two rules this file keeps, because breaking either is how a suite passes
-- while proving nothing:
--
--   * Its user ids are its own. `rls_checks.sql` owns the 1/2/3 series; this
--     file owns the a/b/c series. An id shared between files once quietly made
--     "an ordinary user" an administrator, and every privilege check in the
--     file passed for the wrong reason.
--   * Every assertion can fail. A check that reads `assert n >= 0` is not a
--     check. Where a guard is expected to refuse, the refusal is caught by
--     error class and the fall-through path raises.
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Roles and grants exist already: _local_shim.sql creates them and the
-- migrations grant against them.

-- --------------------------------------------------- assertion counter ----
create table if not exists public.test_assertions (n integer not null);
delete from public.test_assertions;
insert into public.test_assertions values (0);

create or replace function public.ok(label text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.test_assertions set n = n + 1;
  raise notice 'PASS  %', label;
end;
$$;
grant execute on function public.ok(text) to public;

/*
 * Looks an advertisement up regardless of who is asking.
 *
 * Needed because several checks have to aim at a row the caller cannot see —
 * a stranger reporting a pending advertisement, for instance. Selecting the id
 * as that caller would return no rows, the statement would affect nothing, and
 * the check would pass without ever reaching the policy it is meant to test.
 */
create or replace function public.test_ad_id(p_title text)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$ select id from public.ads where title = p_title order by created_at limit 1 $$;
grant execute on function public.test_ad_id(text) to public;

-- ---------------------------------------------------------------- cast ----
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'asha@example.com',  '{"full_name":"Asha Verma","phone":"9812345670"}'),
  ('b0000000-0000-4000-8000-000000000002', 'balu@example.com',  '{"full_name":"Balu Singh","phone":"9812345671"}'),
  ('c0000000-0000-4000-8000-000000000003', 'mod@example.com',   '{"full_name":"Shree Moderator"}');

update public.profiles set role = 'moderator'
 where id = 'c0000000-0000-4000-8000-000000000003';

-- A guard against the fault above: the two advertisers must be ordinary, and
-- the moderator must be the only one who is not.
do $$
declare n int;
begin
  select count(*) into n from public.profiles
   where id in ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002')
     and role = 'user';
  assert n = 2, format('the two advertisers should be ordinary users, %s are', n);
  perform public.ok('the test cast is set up with the roles it claims');

  select count(*) into n from public.profiles where role in ('admin', 'moderator');
  assert n = 1, format('exactly one staff account expected, found %s', n);
  perform public.ok('exactly one staff account exists in this suite');
end $$;

-- =========================================================================
-- 1. Identity: the database issues the reference and the slug
-- =========================================================================
set role authenticated;
select set_config('test.uid', 'a0000000-0000-4000-8000-000000000001', false);

do $$
declare
  cat uuid := (select id from public.categories where slug = 'jobs-full-time');
  loc uuid := (select id from public.locations  where slug = 'roorkee-civil-lines');
  ad1 uuid;
  ad2 uuid;
  r   record;
  s   text;
begin
  insert into public.ads (user_id, category_id, location_id, title, description,
                          price, price_type, contact_name, contact_phone, contact_whatsapp,
                          contact_email, show_phone, show_whatsapp, status, package_id)
  values ('a0000000-0000-4000-8000-000000000001', cat, loc,
          'Accounts assistant required in Roorkee',
          'A trading firm near the clock tower needs an accounts assistant familiar with GST returns.',
          22000, 'fixed', 'Asha Verma', '9812345670', '9812345670',
          'asha@example.com', true, true, 'pending', 'basic')
  returning id into ad1;
  perform public.ok('an advertiser can submit a classified advertisement');

  select reference, slug, status, published_at, expires_at, view_count, package_price_paise
    into r from public.ads where id = ad1;

  assert r.reference ~ '^SC[0-9]{6}$', format('reference %s is not in SCnnnnnn form', r.reference);
  perform public.ok('the database issues a reference in SCnnnnnn form');

  assert r.slug = 'accounts-assistant-required-in-roorkee-' || lower(r.reference),
    format('slug was %s', r.slug);
  perform public.ok('the slug is derived from the title and the reference');

  assert r.status = 'pending', format('status was %s, expected pending', r.status);
  perform public.ok('a submitted advertisement lands in review, not live');

  assert r.published_at is null and r.expires_at is null,
    'a submitted advertisement must not carry publication dates';
  perform public.ok('a submitted advertisement carries no publication window');

  assert r.view_count = 0, format('view count started at %s', r.view_count);
  perform public.ok('a submitted advertisement starts with no views');

  assert r.package_price_paise is null,
    format('package price was stamped %s while pricing is unconfigured', r.package_price_paise);
  perform public.ok('the package price is stamped from the package record');

  -- A second advertisement with exactly the same title must not collide.
  insert into public.ads (user_id, category_id, location_id, title, description,
                          price_type, contact_name, contact_phone, status, package_id)
  values ('a0000000-0000-4000-8000-000000000001', cat, loc,
          'Accounts assistant required in Roorkee',
          'A second firm, also near the clock tower, needs an accounts assistant for part-time work.',
          'on_call', 'Asha Verma', '9812345670', 'pending', 'basic')
  returning id into ad2;

  select slug into s from public.ads where id = ad2;
  assert s <> r.slug, 'two advertisements with the same title were given the same slug';
  perform public.ok('identical titles still produce distinct slugs');

  -- A title with no ASCII at all still has to be reachable.
  insert into public.ads (user_id, category_id, location_id, title, description,
                          price_type, contact_name, contact_phone, status, package_id)
  values ('a0000000-0000-4000-8000-000000000001', cat, loc,
          'मकान किराये पर देना है रुड़की में',
          'रुड़की सिविल लाइंस में दो कमरों का मकान किराये पर उपलब्ध है। संपर्क करें।',
          'on_call', 'Asha Verma', '9812345670', 'pending', 'basic')
  returning id into ad2;
  select a.slug into s from public.ads a where a.id = ad2;
  assert s = lower((select a.reference from public.ads a where a.id = ad2)),
    format('Devanagari title produced slug %s', s);
  perform public.ok('a Devanagari title falls back to the reference as its slug');
end $$;

-- Columns the database owns cannot even be named in an INSERT.
do $$
declare
  cat uuid := (select id from public.categories where slug = 'jobs-full-time');
  loc uuid := (select id from public.locations  where slug = 'roorkee-civil-lines');
begin
  begin
    execute format($f$
      insert into public.ads (user_id, category_id, location_id, title, description,
                              price_type, contact_name, contact_phone, status, reference)
      values (%L, %L, %L, 'Chosen reference attempt here',
              'An attempt to name the advertisement reference from the client side.',
              'on_call', 'Asha Verma', '9812345670', 'pending', 'SC999999')
    $f$, 'a0000000-0000-4000-8000-000000000001', cat, loc);
    raise exception 'FAIL: an advertiser named their own reference';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot name their own reference');
  end;

  begin
    execute format($f$
      insert into public.ads (user_id, category_id, location_id, title, description,
                              price_type, contact_name, contact_phone, status, slug)
      values (%L, %L, %L, 'Chosen slug attempt goes here',
              'An attempt to choose the advertisement URL from the client side.',
              'on_call', 'Asha Verma', '9812345670', 'pending', 'premium-front-page')
    $f$, 'a0000000-0000-4000-8000-000000000001', cat, loc);
    raise exception 'FAIL: an advertiser chose their own slug';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot choose their own URL');
  end;

  begin
    execute format($f$
      insert into public.ads (user_id, category_id, location_id, title, description,
                              price_type, contact_name, contact_phone, status, expires_at)
      values (%L, %L, %L, 'Self chosen expiry attempt',
              'An attempt to set the advertisement lifetime at submission time.',
              'on_call', 'Asha Verma', '9812345670', 'pending', now() + interval '10 years')
    $f$, 'a0000000-0000-4000-8000-000000000001', cat, loc);
    raise exception 'FAIL: an advertiser set their own expiry at insert';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot set a lifetime at submission');
  end;

  begin
    execute format($f$
      insert into public.ads (user_id, category_id, location_id, title, description,
                              price_type, contact_name, contact_phone, status, is_featured, featured_until)
      values (%L, %L, %L, 'Self featured placement attempt',
              'An attempt to take featured placement without the office granting it.',
              'on_call', 'Asha Verma', '9812345670', 'pending', true, now() + interval '30 days')
    $f$, 'a0000000-0000-4000-8000-000000000001', cat, loc);
    raise exception 'FAIL: an advertiser featured themselves at insert';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot feature themselves at submission');
  end;

  -- Submitting on someone else's behalf.
  begin
    insert into public.ads (user_id, category_id, location_id, title, description,
                            price_type, contact_name, contact_phone, status, package_id)
    values ('b0000000-0000-4000-8000-000000000002', cat, loc,
            'Advertisement filed against another account',
            'An attempt to create an advertisement that belongs to a different user.',
            'on_call', 'Asha Verma', '9812345670', 'pending', 'basic');
    raise exception 'FAIL: an advertiser submitted an advertisement as someone else';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot submit on another account');
  end;
end $$;

-- =========================================================================
-- 2. Packages and pricing
-- =========================================================================
reset role;
select set_config('test.uid', '', false);

insert into public.packages (id, name, summary, price_paise, is_active, sort_order)
values ('legacy-strip', 'Legacy strip', 'A retired package kept for old records.', 50000, false, 90)
on conflict (id) do update set is_active = false, price_paise = 50000;

set role authenticated;
select set_config('test.uid', 'a0000000-0000-4000-8000-000000000001', false);

do $$
declare
  cat uuid := (select id from public.categories where slug = 'jobs-full-time');
  loc uuid := (select id from public.locations  where slug = 'roorkee-civil-lines');
  n   int;
begin
  begin
    insert into public.ads (user_id, category_id, location_id, title, description,
                            price_type, contact_name, contact_phone, status, package_id)
    values ('a0000000-0000-4000-8000-000000000001', cat, loc,
            'Advertisement on a retired package',
            'An attempt to buy a package that the office has withdrawn from sale.',
            'on_call', 'Asha Verma', '9812345670', 'pending', 'legacy-strip');
    raise exception 'FAIL: a retired package was sold';
  exception when foreign_key_violation then
    perform public.ok('a withdrawn package cannot be bought');
  end;

  begin
    insert into public.ads (user_id, category_id, location_id, title, description,
                            price_type, contact_name, contact_phone, status, package_id)
    values ('a0000000-0000-4000-8000-000000000001', cat, loc,
            'Advertisement on an invented package',
            'An attempt to name a package identifier that does not exist at all.',
            'on_call', 'Asha Verma', '9812345670', 'pending', 'platinum-unlimited');
    raise exception 'FAIL: an invented package was accepted';
  exception when foreign_key_violation then
    perform public.ok('an unknown package identifier is refused');
  end;

  select count(*) into n from public.packages where is_active;
  assert n = 3, format('expected 3 sellable packages, found %s', n);
  perform public.ok('only active packages are on sale');

  select count(*) into n from public.packages where price_paise is not null and is_active;
  assert n = 0, format('%s active packages carry an invented price', n);
  perform public.ok('no package ships with a price nobody agreed to');
end $$;

-- A real rate, once the office gives one, is what gets stamped.
reset role;
select set_config('test.uid', '', false);
update public.packages set price_paise = 25000 where id = 'standard';

set role authenticated;
select set_config('test.uid', 'a0000000-0000-4000-8000-000000000001', false);

do $$
declare
  cat uuid := (select id from public.categories where slug = 'jobs-full-time');
  loc uuid := (select id from public.locations  where slug = 'roorkee-civil-lines');
  ad  uuid;
  amount int;
begin
  insert into public.ads (user_id, category_id, location_id, title, description,
                          price_type, contact_name, contact_phone, status, package_id)
  values ('a0000000-0000-4000-8000-000000000001', cat, loc,
          'Advertisement taken on the standard package',
          'A submission used to prove that the rate is read from the package record on the server.',
          'on_call', 'Asha Verma', '9812345670', 'pending', 'standard')
  returning id into ad;

  select package_price_paise into amount from public.ads where id = ad;
  assert amount = 25000, format('stamped price was %s, expected 25000', amount);
  perform public.ok('the stamped price comes from the package record, not the request');
end $$;

-- =========================================================================
-- 3. Display advertisements
-- =========================================================================
do $$
declare
  loc uuid := (select id from public.locations where slug = 'roorkee-civil-lines');
  cat uuid := (select id from public.categories where slug = 'jobs-full-time');
  ad  uuid;
  n   int;
begin
  insert into public.ads (kind, user_id, category_id, location_id, title, description,
                          price_type, contact_name, contact_phone, status)
  values ('display', 'a0000000-0000-4000-8000-000000000001', null, loc,
          'Half page for the Diwali campaign',
          '',
          'on_call', 'Asha Verma', '9812345670', 'pending')
  returning id into ad;
  perform public.ok('a display advertisement needs no category and no description');

  insert into public.display_ad_details (ad_id, organisation_name, website, notes)
  values (ad, 'Verma Traders', 'https://example.com', 'Artwork follows from our agency.');
  perform public.ok('display details attach to a display advertisement');

  -- Four files, then a fifth.
  for i in 0 .. public.setting_int('ads.max_artwork_files', 4) - 1 loop
    insert into public.ad_artwork (ad_id, storage_path, file_name, content_type, byte_size, sort_order)
    values (ad, format('a0000000-0000-4000-8000-000000000001/%s/%s.pdf', ad, i),
            format('artwork-%s.pdf', i), 'application/pdf', 240000, i);
  end loop;
  begin
    insert into public.ad_artwork (ad_id, storage_path, file_name, content_type, byte_size, sort_order)
    values (ad, 'a0000000-0000-4000-8000-000000000001/extra.pdf', 'extra.pdf', 'application/pdf', 1000, 99);
    raise exception 'FAIL: the artwork limit was not enforced';
  exception when check_violation then
    perform public.ok(format('the artwork limit holds at %s files',
                             public.setting_int('ads.max_artwork_files', 4)));
  end;

  begin
    insert into public.ad_artwork (ad_id, storage_path, file_name, content_type, byte_size, sort_order)
    values (ad, 'a0000000-0000-4000-8000-000000000001/sheet.xlsx', 'sheet.xlsx',
            'application/vnd.ms-excel', 1000, 50);
    raise exception 'FAIL: artwork accepted a file type it does not publish';
  exception when check_violation then
    perform public.ok('artwork accepts only images and PDFs');
  end;

  -- A display advertisement carries no price and no package.
  begin
    update public.ads set price = 5000, price_type = 'fixed' where id = ad;
    raise exception 'FAIL: a display advertisement was given a price';
  exception when check_violation then
    perform public.ok('a display advertisement carries no price of its own');
  end;

  -- A classified still must have a category.
  begin
    insert into public.ads (kind, user_id, category_id, location_id, title, description,
                            price_type, contact_name, contact_phone, status, package_id)
    values ('classified', 'a0000000-0000-4000-8000-000000000001', null, loc,
            'Classified without any category',
            'An attempt to file a classified advertisement with no section to put it in.',
            'on_call', 'Asha Verma', '9812345670', 'pending', 'basic');
    raise exception 'FAIL: a classified was filed without a category';
  exception when check_violation then
    perform public.ok('a classified advertisement must name a category');
  end;

  -- Display details must not attach to a classified.
  begin
    insert into public.display_ad_details (ad_id, organisation_name)
    select id, 'Verma Traders' from public.ads
     where kind = 'classified' and user_id = 'a0000000-0000-4000-8000-000000000001' limit 1;
    raise exception 'FAIL: display details attached to a classified advertisement';
  exception when check_violation then
    perform public.ok('display details cannot attach to a classified advertisement');
  end;

  select count(*) into n from public.ads
   where kind = 'display' and user_id = 'a0000000-0000-4000-8000-000000000001';
  assert n = 1, format('expected 1 display advertisement, found %s', n);
  perform public.ok('the two kinds of advertisement live in one table and stay distinct');
end $$;

-- =========================================================================
-- 4. Moderation: approving, and the ten things an owner must not do
-- =========================================================================
set role authenticated;
select set_config('test.uid', 'c0000000-0000-4000-8000-000000000003', false);

do $$
declare
  ad uuid := (select id from public.ads where title = 'Accounts assistant required in Roorkee'
               order by created_at limit 1);
  r  record;
begin
  update public.ads set status = 'approved' where id = ad;
  select published_at, expires_at, status into r from public.ads where id = ad;
  assert r.status = 'approved' and r.published_at is not null and r.expires_at is not null,
    'approval did not stamp a publication window';
  perform public.ok('staff approval stamps the publication window');

  -- Hide the second advertisement's phone number so consent can be tested.
  update public.ads set status = 'approved'
   where title = 'Accounts assistant required in Roorkee'
     and id <> ad;
  update public.ads set status = 'approved'
   where title = 'मकान किराये पर देना है रुड़की में';
  perform public.ok('staff can approve a batch of advertisements');
end $$;

set role authenticated;
select set_config('test.uid', 'a0000000-0000-4000-8000-000000000001', false);

do $$
declare
  ad      uuid := (select id from public.ads where status = 'approved'
                    and user_id = 'a0000000-0000-4000-8000-000000000001'
                    order by created_at limit 1);
  before  record;
  after   record;
begin
  select expires_at, published_at, view_count, package_price_paise, reference, slug, kind
    into before from public.ads where id = ad;

  -- ATTACK 1 — run for ever without renewing.
  update public.ads set expires_at = now() + interval '10 years' where id = ad;
  select expires_at into after from public.ads where id = ad;
  assert after.expires_at = before.expires_at,
    format('owner moved expiry from %s to %s', before.expires_at, after.expires_at);
  perform public.ok('an owner cannot extend their own advertisement''s lifetime');

  -- ATTACK 2 — appear newer than it is.
  update public.ads set published_at = now() + interval '1 day' where id = ad;
  select published_at into after from public.ads where id = ad;
  assert after.published_at = before.published_at, 'owner rewrote their publication date';
  perform public.ok('an owner cannot rewrite when their advertisement went live');

  -- ATTACK 3 — invent an audience.
  update public.ads set view_count = 99999 where id = ad;
  select view_count into after from public.ads where id = ad;
  assert after.view_count = before.view_count,
    format('owner set view count to %s', after.view_count);
  perform public.ok('an owner cannot invent their own view count');

  -- ATTACK 4 — self-approval.
  update public.ads set status = 'pending' where id = ad;
  begin
    update public.ads set status = 'approved' where id = ad;
    raise exception 'FAIL: owner approved their own advertisement';
  exception when insufficient_privilege then
    perform public.ok('an owner cannot approve their own advertisement');
  end;

  -- ATTACK 5 — featured placement.
  begin
    update public.ads set is_featured = true, featured_until = now() + interval '30 days' where id = ad;
    raise exception 'FAIL: owner granted themselves featured placement';
  exception when insufficient_privilege then
    perform public.ok('an owner cannot grant themselves featured placement');
  end;

  -- ATTACK 6 — a staff role.
  begin
    update public.profiles set role = 'moderator' where id = auth.uid();
    raise exception 'FAIL: owner promoted themselves';
  exception when insufficient_privilege then
    perform public.ok('an owner cannot promote themselves to staff');
  end;

  -- ATTACK 7 — hand the advertisement to somebody else.
  begin
    update public.ads set user_id = 'b0000000-0000-4000-8000-000000000002' where id = ad;
    raise exception 'FAIL: owner transferred their advertisement';
  exception when insufficient_privilege then
    perform public.ok('an advertisement cannot be transferred to another account');
  end;

  -- ATTACK 8 — rewrite identity after the fact.
  update public.ads set reference = 'SC000001', slug = 'front-page-banner', kind = 'display'
   where id = ad;
  select reference, slug, kind into after from public.ads where id = ad;
  assert after.reference = before.reference and after.slug = before.slug and after.kind = before.kind,
    'owner rewrote the reference, slug or kind of a live advertisement';
  perform public.ok('reference, slug and kind are issued once and never rewritten');

  -- ATTACK 9 — upgrade the package without paying for it.
  begin
    update public.ads set package_id = 'premium' where id = ad;
    raise exception 'FAIL: owner upgraded their own package';
  exception when insufficient_privilege then
    perform public.ok('an owner cannot upgrade their own package');
  end;

  -- ATTACK 10 — discount themselves.
  update public.ads set package_price_paise = 0 where id = ad;
  select package_price_paise into after from public.ads where id = ad;
  assert after.package_price_paise is not distinct from before.package_price_paise,
    'owner rewrote the price stamped on their advertisement';
  perform public.ok('an owner cannot rewrite the price stamped on their advertisement');

  -- An owner may still do the things an owner is for.
  update public.ads set title = 'Accounts assistant required in Roorkee urgently' where id = ad;
  perform public.ok('an owner can still edit their own advertisement');

  update public.ads set status = 'draft' where id = ad;
  assert (select status from public.ads where id = ad) = 'draft', 'owner could not withdraw';
  perform public.ok('an owner can withdraw their own advertisement');
end $$;

-- Another advertiser is not an owner.
select set_config('test.uid', 'b0000000-0000-4000-8000-000000000002', false);
do $$
declare
  ad uuid := (select id from public.ads where status = 'approved' limit 1);
  n  int;
begin
  update public.ads set title = 'Retitled by somebody else entirely' where id = ad;
  get diagnostics n = row_count;
  assert n = 0, format('a stranger edited %s advertisement rows', n);
  perform public.ok('a signed-in stranger cannot edit an advertisement they do not own');

  delete from public.ads where id = ad;
  get diagnostics n = row_count;
  assert n = 0, format('a stranger deleted %s advertisement rows', n);
  perform public.ok('a signed-in stranger cannot delete an advertisement they do not own');
end $$;

-- =========================================================================
-- 5. The public read path, and consent
-- =========================================================================
reset role;
select set_config('test.uid', '', false);

-- One approved advertisement withholds its telephone number, one publishes it.
update public.ads set show_phone = false, show_whatsapp = false
 where title = 'मकान किराये पर देना है रुड़की में';

set role anon;
select set_config('test.uid', '', false);

do $$
declare
  shown   record;
  hidden  record;
  n       int;
begin
  select * into shown from public.public_ads
   where title = 'Accounts assistant required in Roorkee' limit 1;
  assert shown.contact_phone = '9812345670',
    format('a consented number came back as %s', coalesce(shown.contact_phone, 'NULL'));
  perform public.ok('a telephone number the advertiser published is visible');

  select * into hidden from public.public_ads
   where title = 'मकान किराये पर देना है रुड़की में' limit 1;
  assert hidden.contact_phone is null, 'a withheld telephone number was published';
  perform public.ok('a telephone number the advertiser withheld is NULL, not hidden by the interface');

  assert hidden.contact_whatsapp is null, 'a withheld WhatsApp number was published';
  perform public.ok('WhatsApp consent is honoured separately from the telephone number');

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'public_ads' and column_name = 'contact_email';
  assert n = 0, 'contact_email is exposed by the public view';
  perform public.ok('contact email is not in the public view at all');

  -- The underlying columns are not reachable directly.
  begin
    execute 'select contact_phone from public.ads limit 1';
    raise exception 'FAIL: anonymous visitor read ads.contact_phone directly';
  exception when insufficient_privilege then
    perform public.ok('the contact columns are revoked at the table, not merely omitted from a view');
  end;

  -- Nothing unapproved is reachable through the public view.
  select count(*) into n from public.public_ads
   where title = 'Half page for the Diwali campaign';
  assert n = 0, 'a pending advertisement appeared in the public view';
  perform public.ok('a pending advertisement is absent from the public view');

  select count(*) into n from public.public_ads p
    join public.ads a on a.id = p.id
   where a.status <> 'approved';
  assert n = 0, format('%s unapproved advertisements leaked through the public view', n);
  perform public.ok('the public view contains only approved advertisements');

  -- Artwork stays private even though its advertisement is not.
  select count(*) into n from public.ad_artwork;
  assert n = 0, format('anonymous visitor read %s artwork rows', n);
  perform public.ok('display artwork is invisible to the public');

  begin
    execute 'select count(*) from public.owner_ads';
    raise exception 'FAIL: anonymous visitor reached owner_ads';
  exception when insufficient_privilege then
    perform public.ok('the owner view is not granted to a caller with no session');
  end;

  begin
    execute 'select count(*) from public.moderation_ads';
    raise exception 'FAIL: anonymous visitor reached the moderation queue';
  exception when insufficient_privilege then
    perform public.ok('the moderation queue is not granted to a caller with no session');
  end;

  select count(*) into n from public.audit_log;
  assert n = 0, format('anonymous visitor read %s audit rows', n);
  perform public.ok('the audit trail is invisible to the public');
end $$;

-- Expiry is applied by the view, not only by the sweep.
reset role;
select set_config('test.uid', '', false);
update public.ads set expires_at = now() - interval '1 hour'
 where title = 'मकान किराये पर देना है रुड़की में';

set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.public_ads
   where title = 'मकान किराये पर देना है रुड़की में';
  assert n = 0, 'an expired advertisement was still public';
  perform public.ok('an advertisement past its expiry leaves the public view immediately');
end $$;

-- =========================================================================
-- 6. View counting
-- =========================================================================
do $$
declare
  ad      uuid := (select id from public.public_ads limit 1);
  before  int;
  after   int;
  touched timestamptz;
  later   timestamptz;
begin
  select view_count, updated_at into before, touched from public.public_ads where id = ad;

  perform public.record_ad_view(ad);
  select view_count, updated_at into after, later from public.public_ads where id = ad;
  assert after = before + 1, format('view count went from %s to %s', before, after);
  perform public.ok('an anonymous reader''s view is counted');

  assert later = touched, 'counting a view made the advertisement look edited';
  perform public.ok('counting a view does not change the advertisement''s updated timestamp');

  perform public.record_ad_view(ad);
  select view_count into after from public.public_ads where id = ad;
  assert after = before + 1, format('a repeated view in one transaction counted %s times', after - before);
  perform public.ok('a repeated view inside one request counts once');
end $$;

-- =========================================================================
-- 7. Reports
-- =========================================================================
do $$
declare
  ad uuid := (select id from public.public_ads limit 1);
  n  int;
begin
  insert into public.ad_reports (ad_id, reporter_id, reason, details)
  values (ad, null, 'fraud', 'The number given does not belong to the advertiser.');
  perform public.ok('a reader who is not signed in can still report an advertisement');

  select count(*) into n from public.ad_reports;
  assert n = 0, format('an anonymous reporter read %s rows of the report queue', n);
  perform public.ok('the report queue is write-only for the public');

  begin
    insert into public.ad_reports (ad_id, reporter_id, reason)
    values (ad, 'a0000000-0000-4000-8000-000000000001', 'spam');
    raise exception 'FAIL: an anonymous reader filed a report as a named account';
  exception when insufficient_privilege then
    perform public.ok('a report cannot be filed in somebody else''s name');
  end;
end $$;

set role authenticated;
select set_config('test.uid', 'b0000000-0000-4000-8000-000000000002', false);

do $$
declare
  ad uuid := (select id from public.public_ads limit 1);
  n  int;
begin
  insert into public.ad_reports (ad_id, reporter_id, reason, details)
  values (ad, 'b0000000-0000-4000-8000-000000000002', 'incorrect', 'The salary quoted is not the salary offered.');
  perform public.ok('a signed-in reader can report an advertisement');

  select count(*) into n from public.ad_reports;
  assert n = 1, format('a reporter saw %s reports, expected only their own', n);
  perform public.ok('a reporter sees their own report and nobody else''s');

  begin
    insert into public.ad_reports (ad_id, reporter_id, reason)
    values (ad, 'b0000000-0000-4000-8000-000000000002', 'spam');
    raise exception 'FAIL: the same reader reported the same advertisement twice';
  exception when unique_violation then
    perform public.ok('one reader may report one advertisement once');
  end;

  begin
    insert into public.ad_reports (ad_id, reporter_id, reason, status, reviewed_by, reviewed_at)
    values (ad, 'b0000000-0000-4000-8000-000000000002', 'spam', 'actioned',
            'b0000000-0000-4000-8000-000000000002', now());
    raise exception 'FAIL: a reporter resolved their own report';
  exception when insufficient_privilege then
    perform public.ok('a report is opened by a reader and resolved by staff');
  end;

  update public.ad_reports set status = 'dismissed' where reporter_id = auth.uid();
  get diagnostics n = row_count;
  assert n = 0, format('a reporter changed %s report rows', n);
  perform public.ok('a reporter cannot dismiss their own report');

  -- A report against something the public cannot see is not a report. The id
  -- is fetched through the definer helper, because a stranger cannot select a
  -- pending row and an INSERT ... SELECT that matches nothing proves nothing.
  begin
    insert into public.ad_reports (ad_id, reporter_id, reason)
    values (public.test_ad_id('Half page for the Diwali campaign'),
            'b0000000-0000-4000-8000-000000000002', 'spam');
    raise exception 'FAIL: a pending advertisement was reported by a stranger';
  exception when insufficient_privilege then
    perform public.ok('only a publicly visible advertisement can be reported');
  end;
end $$;

select set_config('test.uid', 'c0000000-0000-4000-8000-000000000003', false);
do $$
declare n int;
begin
  select count(*) into n from public.ad_reports;
  assert n = 2, format('staff saw %s reports, expected 2', n);
  perform public.ok('staff read the whole report queue');

  update public.ad_reports set status = 'dismissed', reviewed_by = auth.uid(), reviewed_at = now()
   where status = 'open';
  get diagnostics n = row_count;
  assert n = 2, format('staff resolved %s reports, expected 2', n);
  perform public.ok('staff can resolve a report');

  -- A resolution has to say who resolved it.
  begin
    update public.ad_reports set status = 'actioned', reviewed_by = null, reviewed_at = null
     where status = 'dismissed';
    raise exception 'FAIL: a report was resolved by nobody';
  exception when check_violation then
    perform public.ok('a resolved report records who resolved it and when');
  end;
end $$;

-- =========================================================================
-- 8. Payments
-- =========================================================================
set role authenticated;
select set_config('test.uid', 'a0000000-0000-4000-8000-000000000001', false);

do $$
declare
  ad      uuid := (select id from public.ads
                    where user_id = 'a0000000-0000-4000-8000-000000000001'
                      and package_id = 'standard' limit 1);
  other   uuid := (select id from public.ads
                    where user_id <> 'a0000000-0000-4000-8000-000000000001' limit 1);
  display uuid := (select id from public.ads where kind = 'display' limit 1);
  pay     uuid;
  amount  int;
  package text;
  n       int;
begin
  insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
  values (ad, 'a0000000-0000-4000-8000-000000000001', 'basic', 1, 'razorpay', 'order_test_1')
  returning id into pay;

  select p.amount_paise, p.package_id into amount, package from public.payments p where p.id = pay;
  assert amount = 25000, format('the payment was recorded at %s paise, expected 25000', amount);
  perform public.ok('a payment costs what the package costs, not what the request said');

  assert package = 'standard', format('the payment was filed against package %s', package);
  perform public.ok('a payment names the package the advertisement was taken on');

  begin
    update public.payments set amount_paise = 1 where id = pay;
    raise exception 'FAIL: an advertiser re-priced their own payment';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot re-price a payment');
  end;

  begin
    update public.payments set status = 'paid', paid_at = now() where id = pay;
    raise exception 'FAIL: an advertiser marked their own payment paid';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot mark their own payment paid');
  end;

  begin
    insert into public.payments (ad_id, user_id, package_id, amount_paise)
    values (display, 'a0000000-0000-4000-8000-000000000001', 'basic', 0);
    raise exception 'FAIL: a payment was raised against an advertisement with no package';
  exception when check_violation then
    perform public.ok('an advertisement with no package has nothing to pay for');
  end;

  select count(*) into n from public.payments;
  assert n = 1, format('the advertiser saw %s payments, expected their own 1', n);
  perform public.ok('an advertiser reads their own receipts');
end $$;

select set_config('test.uid', 'b0000000-0000-4000-8000-000000000002', false);
do $$
declare
  ad uuid := public.test_ad_id('Advertisement taken on the standard package');
  n  int;
begin
  select count(*) into n from public.payments;
  assert n = 0, format('a stranger read %s payment rows', n);
  perform public.ok('a payment is invisible to anyone but its advertiser and staff');

  begin
    insert into public.payments (ad_id, user_id, package_id, amount_paise)
    values (ad, 'b0000000-0000-4000-8000-000000000002', 'basic', 0);
    raise exception 'FAIL: a stranger raised a payment against another advertisement';
  exception when insufficient_privilege then
    perform public.ok('a payment can only be raised against your own advertisement');
  end;
end $$;

select set_config('test.uid', 'c0000000-0000-4000-8000-000000000003', false);
do $$
declare
  pay    uuid := (select id from public.payments limit 1);
  second uuid;
  n      int;
begin
  begin
    update public.payments set status = 'paid' where id = pay;
    raise exception 'FAIL: a payment was marked paid with no settlement time';
  exception when check_violation then
    perform public.ok('a paid payment records when it was paid');
  end;

  update public.payments set status = 'paid', paid_at = now(), provider_payment_id = 'pay_test_1'
   where id = pay;
  select count(*) into n from public.payments where id = pay and status = 'paid';
  assert n = 1, 'staff could not settle a payment';
  perform public.ok('staff can settle a payment');

  -- Phase 9 makes `paid` terminal but for a refund. That is what makes a
  -- repeated callback, a second tab and a refresh after payment harmless, so
  -- the failure-reason rule is now asserted against an attempt that could
  -- still fail, and the refusal to un-pay is asserted on its own.
  begin
    update public.payments set status = 'failed', failure_reason = 'Card declined.' where id = pay;
    raise exception 'FAIL: a settled payment was moved to failed';
  exception when check_violation then
    perform public.ok('a paid payment cannot be moved to failed by a late message');
  end;

  insert into public.payments (ad_id, user_id, package_id, amount_paise)
  select ad_id, user_id, package_id, 1 from public.payments where id = pay
  returning id into second;

  begin
    update public.payments set status = 'failed', failure_reason = null where id = second;
    raise exception 'FAIL: a payment failed without a reason';
  exception when check_violation then
    perform public.ok('a failed payment records why it failed');
  end;
end $$;

-- =========================================================================
-- 9. Favourites
-- =========================================================================
set role authenticated;
select set_config('test.uid', 'a0000000-0000-4000-8000-000000000001', false);

do $$
declare
  ad uuid := (select id from public.public_ads limit 1);
  n  int;
begin
  insert into public.favourites (user_id, ad_id)
  values ('a0000000-0000-4000-8000-000000000001', ad);
  perform public.ok('a reader can save an advertisement');

  select count(*) into n from public.favourites;
  assert n = 1, format('the reader saw %s of their own favourites', n);
  perform public.ok('a reader sees their own saved advertisements');

  begin
    insert into public.favourites (user_id, ad_id)
    values ('b0000000-0000-4000-8000-000000000002', ad);
    raise exception 'FAIL: a reader saved an advertisement into somebody else''s list';
  exception when insufficient_privilege then
    perform public.ok('a reader cannot save into another reader''s list');
  end;
end $$;

select set_config('test.uid', 'b0000000-0000-4000-8000-000000000002', false);
do $$
declare n int;
begin
  select count(*) into n from public.favourites;
  assert n = 0, format('a stranger read %s of another reader''s favourites', n);
  perform public.ok('one reader''s saved advertisements are invisible to another');
end $$;

select set_config('test.uid', 'c0000000-0000-4000-8000-000000000003', false);
do $$
declare n int;
begin
  select count(*) into n from public.favourites;
  assert n = 0, format('staff read %s rows of a reader''s favourites', n);
  perform public.ok('what a reader saved is not visible to staff either');
end $$;

-- =========================================================================
-- 10. The audit trail
-- =========================================================================
do $$
declare
  ad uuid := (select id from public.ads
               where user_id = 'a0000000-0000-4000-8000-000000000001' order by created_at limit 1);
  n  int;
begin
  select count(*) into n from public.audit_log
   where entity = 'advertisement' and entity_id = ad and action = 'ad.created';
  assert n = 1, format('%s creation entries for one advertisement', n);
  perform public.ok('submitting an advertisement is recorded');

  select count(*) into n from public.audit_log
   where entity = 'advertisement' and entity_id = ad and action = 'ad.status_changed'
     and before ->> 'status' = 'pending' and after ->> 'status' = 'approved';
  assert n >= 1, 'approval was not recorded with its before and after';
  perform public.ok('an approval is recorded with what changed');

  select count(*) into n from public.audit_log
   where entity = 'payment' and action = 'payment.status_changed'
     and after ->> 'status' = 'paid';
  assert n = 1, format('%s settlement entries, expected 1', n);
  perform public.ok('settling a payment is recorded');

  select count(*) into n from public.audit_log
   where entity = 'advertisement' and actor_id = 'c0000000-0000-4000-8000-000000000003';
  assert n >= 1, 'the moderator''s decisions were recorded against nobody';
  perform public.ok('an entry records who made the decision');

  begin
    update public.audit_log set summary = 'nothing happened here' where entity_id = ad;
    raise exception 'FAIL: the audit trail was edited';
  exception when insufficient_privilege then
    perform public.ok('an audit entry cannot be edited');
  end;

  begin
    delete from public.audit_log where entity_id = ad;
    raise exception 'FAIL: an audit entry was deleted';
  exception when insufficient_privilege then
    perform public.ok('an audit entry cannot be deleted');
  end;
end $$;

set role authenticated;
select set_config('test.uid', 'a0000000-0000-4000-8000-000000000001', false);
do $$
declare n int;
begin
  select count(*) into n from public.audit_log;
  assert n = 0, format('an ordinary advertiser read %s audit rows', n);
  perform public.ok('the audit trail is invisible to an ordinary account');
end $$;

-- =========================================================================
-- 11. Storage
-- =========================================================================
do $$
declare
  ad uuid := (select id from public.ads
               where user_id = 'a0000000-0000-4000-8000-000000000001' limit 1);
  n  int;
begin
  insert into storage.objects (bucket_id, name)
  values ('ad-images', format('a0000000-0000-4000-8000-000000000001/%s/1.webp', ad));
  perform public.ok('an advertiser can upload into their own folder');

  begin
    insert into storage.objects (bucket_id, name)
    values ('ad-images', format('b0000000-0000-4000-8000-000000000002/%s/1.webp', ad));
    raise exception 'FAIL: an advertiser uploaded into another account''s folder';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot upload into another account''s folder');
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('ad-images', 'loose-file.webp');
    raise exception 'FAIL: a file was uploaded outside the ownership path';
  exception when insufficient_privilege then
    perform public.ok('a file outside the <user>/<advertisement>/ path is refused');
  end;

  -- The case that distinguishes a depth of two from a depth of one, and the
  -- one this suite used to miss: a file dropped straight into the advertiser's
  -- own folder, with no advertisement folder under it. The first segment is
  -- their own id, so ownership alone does not refuse it -- only the depth does.
  begin
    insert into storage.objects (bucket_id, name)
    values ('ad-images', 'a0000000-0000-4000-8000-000000000001/loose.webp');
    raise exception 'FAIL: a file was uploaded loose in the advertiser''s own folder';
  exception when insufficient_privilege then
    perform public.ok('a file loose in the advertiser''s own folder is refused');
  end;

  -- Guards the shim itself. `storage.foldername()` on hosted Supabase returns
  -- the folder parts WITHOUT the file name, so the path the application builds
  -- is two elements. A shim that splits the whole path makes it three, and a
  -- policy written against that passes here and fails in production -- which is
  -- exactly what happened before this assertion existed.
  if coalesce(array_length(storage.foldername('uid/ad/0-abc.png'), 1), 0) <> 2 then
    raise exception 'FAIL: storage.foldername() does not match hosted Supabase (expected 2 parts for uid/ad/file)';
  end if;
  perform public.ok('storage.foldername() matches hosted Supabase semantics');

  insert into storage.objects (bucket_id, name)
  values ('ad-artwork', format('a0000000-0000-4000-8000-000000000001/%s/brief.pdf', ad));
  select count(*) into n from storage.objects where bucket_id = 'ad-artwork';
  assert n = 1, format('the advertiser saw %s of their own artwork files', n);
  perform public.ok('an advertiser reads their own artwork');
end $$;

select set_config('test.uid', 'b0000000-0000-4000-8000-000000000002', false);
do $$
declare n int;
begin
  select count(*) into n from storage.objects where bucket_id = 'ad-artwork';
  assert n = 0, format('a stranger read %s artwork files', n);
  perform public.ok('another advertiser cannot read artwork that is not theirs');

  select count(*) into n from storage.objects where bucket_id = 'ad-images';
  assert n = 1, format('published photographs should be readable, saw %s', n);
  perform public.ok('published photographs stay publicly readable');
end $$;

set role anon;
select set_config('test.uid', '', false);
do $$
declare n int;
begin
  select count(*) into n from storage.objects where bucket_id = 'ad-artwork';
  assert n = 0, format('an anonymous visitor read %s artwork files', n);
  perform public.ok('artwork is unreadable without a session');

  begin
    insert into storage.objects (bucket_id, name) values ('ad-images', 'anon/anon/1.webp');
    raise exception 'FAIL: an anonymous visitor uploaded a file';
  exception when insufficient_privilege then
    perform public.ok('an anonymous visitor cannot upload anything');
  end;
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
