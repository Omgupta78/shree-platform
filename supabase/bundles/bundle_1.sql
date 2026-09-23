-- ============================================================
-- Bundle 1 of 5 — core schema, reference data, views, packages, payments, storage, moderation guard
--
-- Paste this WHOLE file into the Supabase SQL editor and press Run.
-- Run the bundles in order. Wait for each to finish before the next.
-- Built from: 0001_core_schema.sql 0002_seed_reference_data.sql 0003_browse_views.sql 0004_advertisement_kinds_and_packages.sql 0005_payments_reports_favourites.sql 0006_storage_and_audit_trail.sql 0007_moderation_guard_and_public_views.sql
-- Generated from supabase/migrations/ — do not edit by hand.
-- ============================================================

-- ----- begin 0001_core_schema.sql -----
-- =============================================================================
-- Shree Classified — Phase 1: core schema
--
-- Design notes
--  * Authorisation lives in row-level security, not in application code, so a
--    bug in a page or a leaked anon key still cannot expose unapproved ads or
--    another user's data.
--  * Contact details are stored on the ad, not on the profile. Profiles stay
--    private; ads stay publicly readable. A phone number therefore cannot leak
--    through the profiles table, and a user may use different numbers per ad.
--  * Category-specific fields (bedrooms, model year, salary…) go in the
--    `attributes` JSONB column so adding a category needs no migration.
--  * Full-text search uses the 'simple' dictionary rather than 'english'
--    because ad copy is frequently Hindi; 'simple' indexes both scripts
--    without applying English stemming to Hindi words.
--  * Operational values (ad duration, image limit, office contact details)
--    live in app_settings so the site never hardcodes them.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums ----
do $$ begin create type public.user_role as enum ('user', 'moderator', 'admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ad_status as enum ('draft', 'pending', 'approved', 'rejected', 'expired', 'sold'); exception when duplicate_object then null; end $$;
do $$ begin create type public.price_type as enum ('fixed', 'negotiable', 'on_call', 'free'); exception when duplicate_object then null; end $$;
do $$ begin create type public.location_kind as enum ('district', 'city', 'area'); exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------- helpers ----

-- Shared updated_at trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -------------------------------------------------------- app settings ----
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

comment on table public.app_settings is
  'Operational configuration read at runtime (ad duration, image limits, office contact details). Keeps business values out of the codebase.';

create or replace function public.setting_int(p_key text, p_default int)
returns int
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = p_key), p_default);
$$;

-- ------------------------------------------------------------ profiles ----
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (char_length(btrim(full_name)) between 2 and 80),
  phone      text check (phone ~ '^[6-9][0-9]{9}$'),
  email      text,
  role       public.user_role not null default 'user',
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.phone is 'Indian mobile number, 10 digits beginning 6-9, stored without country code.';

-- Role checks used throughout the RLS policies below. SECURITY DEFINER so a
-- policy on `profiles` does not recursively evaluate itself when checking the
-- caller's role. Defined after `profiles` because Postgres validates function
-- bodies at creation time.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'moderator') and not is_blocked
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and not is_blocked
  );
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Direct SQL access (the Supabase SQL editor, a migration, or a service-role
-- key) carries no JWT, so auth.uid() is null. Those callers are trusted: this
-- is how the first administrator is promoted, before any admin exists to
-- authorise it. It is not a hole for anonymous API traffic, because the RLS
-- policies below reject an unauthenticated write to these tables before any
-- trigger runs.
create or replace function public.is_trusted_connection()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is null;
$$;

-- A user may edit their own profile, but must never be able to grant
-- themselves a staff role or lift their own block.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.is_admin() or public.is_trusted_connection()) then
    if new.role is distinct from old.role then
      raise exception 'Only an administrator can change a user role'
        using errcode = 'insufficient_privilege';
    end if;
    if new.is_blocked is distinct from old.is_blocked then
      raise exception 'Only an administrator can change blocked status'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Create a profile row automatically whenever Supabase Auth creates a user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'New user'),
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------- categories ----
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories (id) on delete cascade,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (char_length(btrim(name)) between 2 and 60),
  description text,
  icon        text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint categories_not_self_parent check (parent_id is null or parent_id <> id)
);

create index if not exists categories_parent_idx on public.categories (parent_id, sort_order) where is_active;

-- Categories are at most two levels deep (group → category).
create or replace function public.guard_category_depth()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.parent_id is not null
     and exists (select 1 from public.categories where id = new.parent_id and parent_id is not null) then
    raise exception 'Categories may only be nested two levels deep'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists categories_guard_depth on public.categories;
create trigger categories_guard_depth
  before insert or update on public.categories
  for each row execute function public.guard_category_depth();

-- ----------------------------------------------------------- locations ----
create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.locations (id) on delete cascade,
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text not null check (char_length(btrim(name)) between 2 and 80),
  kind       public.location_kind not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint locations_not_self_parent check (parent_id is null or parent_id <> id)
);

create index if not exists locations_parent_idx on public.locations (parent_id, sort_order) where is_active;
create index if not exists locations_kind_idx on public.locations (kind) where is_active;

-- ----------------------------------------------------------------- ads ----

-- Human-quotable reference (SC100001). Doubles as the bridge between a printed
-- classified and its digital counterpart in a later phase.
create sequence if not exists public.ad_reference_seq start 100001;

create table if not exists public.ads (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique default ('SC' || lpad(nextval('public.ad_reference_seq')::text, 6, '0')),
  slug            text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  category_id     uuid not null references public.categories (id) on delete restrict,
  location_id     uuid not null references public.locations (id) on delete restrict,

  title           text not null check (char_length(btrim(title)) between 5 and 120),
  description     text not null check (char_length(btrim(description)) between 20 and 5000),
  price           numeric(12, 2) check (price is null or price >= 0),
  price_type      public.price_type not null default 'fixed',
  attributes      jsonb not null default '{}'::jsonb,

  contact_name    text not null check (char_length(btrim(contact_name)) between 2 and 80),
  contact_phone   text not null check (contact_phone ~ '^[6-9][0-9]{9}$'),
  contact_whatsapp text check (contact_whatsapp ~ '^[6-9][0-9]{9}$'),
  contact_email   text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  show_phone      boolean not null default true,

  status           public.ad_status not null default 'draft',
  rejection_reason text,
  is_featured      boolean not null default false,
  featured_until   timestamptz,

  published_at    timestamptz,
  expires_at      timestamptz,
  view_count      integer not null default 0 check (view_count >= 0),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 'on_call' and 'free' ads carry no numeric price.
  constraint ads_price_matches_type check (
    (price_type in ('on_call', 'free') and price is null)
    or (price_type in ('fixed', 'negotiable'))
  ),
  -- A rejected ad must explain why; nothing else may carry a reason.
  constraint ads_rejection_reason_required check (
    (status = 'rejected' and btrim(coalesce(rejection_reason, '')) <> '')
    or (status <> 'rejected' and rejection_reason is null)
  ),
  -- Anything that has gone live must have a lifetime.
  constraint ads_published_has_dates check (
    status not in ('approved', 'expired', 'sold')
    or (published_at is not null and expires_at is not null)
  ),
  constraint ads_featured_has_end check (not is_featured or featured_until is not null)
);

-- Weighted search vector: a title match outranks a description match.
alter table public.ads
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) stored;

-- Indexes chosen for the Phase 2 browse queries: the public list is always
-- filtered by status and ordered by featured-then-recent.
create index if not exists ads_public_feed_idx
  on public.ads (status, is_featured desc, published_at desc)
  where status = 'approved';
create index if not exists ads_category_idx on public.ads (category_id, status, published_at desc);
create index if not exists ads_location_idx on public.ads (location_id, status, published_at desc);
create index if not exists ads_user_idx     on public.ads (user_id, created_at desc);
create index if not exists ads_expiry_idx   on public.ads (expires_at) where status = 'approved';
create index if not exists ads_search_idx   on public.ads using gin (search_vector);
create index if not exists ads_attributes_idx on public.ads using gin (attributes jsonb_path_ops);
create unique index if not exists ads_slug_reference_idx on public.ads (slug, reference);

drop trigger if exists ads_set_updated_at on public.ads;
create trigger ads_set_updated_at
  before update on public.ads
  for each row execute function public.set_updated_at();

-- Stamp publish/expiry dates when an ad is approved, using the configured
-- duration rather than a hardcoded interval.
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
    new.expires_at   := coalesce(new.expires_at, now() + make_interval(days => duration_days));
    new.rejection_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists ads_stamp_publication on public.ads;
create trigger ads_stamp_publication
  before update on public.ads
  for each row execute function public.stamp_ad_publication();

-- Ordinary users submit ads; only staff may approve, feature or reassign them.
create or replace function public.guard_ad_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_staff() or public.is_trusted_connection() then
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
  -- An owner may withdraw, resubmit or mark sold; never self-approve.
  -- Retiring an ad that is genuinely past its expiry is always permitted so
  -- the scheduled sweep in expire_stale_ads() does not need staff rights.
  if new.status is distinct from old.status
     and new.status not in ('draft', 'pending', 'sold')
     and not (new.status = 'expired'
              and old.expires_at is not null
              and old.expires_at <= now()) then
    raise exception 'Only Shree Classified staff can set an advertisement to %', new.status
      using errcode = 'insufficient_privilege';
  end if;

  -- Moving away from 'rejected' clears the reason, satisfying the
  -- ads_rejection_reason_required constraint without the client having to.
  if old.status = 'rejected' and new.status is distinct from 'rejected' then
    new.rejection_reason := null;
  end if;
  -- Editing a live ad sends it back for review.
  if old.status = 'approved'
     and new.status = 'approved'
     and (new.title is distinct from old.title
          or new.description is distinct from old.description
          or new.price is distinct from old.price
          or new.category_id is distinct from old.category_id) then
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists ads_guard_moderation on public.ads;
create trigger ads_guard_moderation
  before insert or update on public.ads
  for each row execute function public.guard_ad_moderation();

-- ---------------------------------------------------------- ad images ----
create table if not exists public.ad_images (
  id           uuid primary key default gen_random_uuid(),
  ad_id        uuid not null references public.ads (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) between 3 and 400),
  width        integer check (width is null or width > 0),
  height       integer check (height is null or height > 0),
  sort_order   integer not null default 0 check (sort_order >= 0),
  created_at   timestamptz not null default now(),
  -- Deferrable so images can be reordered inside a single transaction
  -- without tripping over intermediate duplicate positions.
  constraint ad_images_position_unique unique (ad_id, sort_order) deferrable initially immediate
);

create index if not exists ad_images_ad_idx on public.ad_images (ad_id, sort_order);

create or replace function public.enforce_ad_image_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  max_images int := public.setting_int('ads.max_images', 8);
begin
  if (select count(*) from public.ad_images where ad_id = new.ad_id) >= max_images then
    raise exception 'An advertisement may have at most % images', max_images
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists ad_images_enforce_limit on public.ad_images;
create trigger ad_images_enforce_limit
  before insert on public.ad_images
  for each row execute function public.enforce_ad_image_limit();

-- =========================================================================
-- Row level security
-- =========================================================================
alter table public.profiles     enable row level security;
alter table public.categories   enable row level security;
alter table public.locations    enable row level security;
alter table public.ads          enable row level security;
alter table public.ad_images    enable row level security;
alter table public.app_settings enable row level security;

-- profiles: private to their owner and to staff.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_staff());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete using (public.is_admin());

-- Taxonomies: world-readable when active, staff-writable.
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select using (is_active or public.is_staff());

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select using (is_active or public.is_staff());

drop policy if exists locations_write on public.locations;
create policy locations_write on public.locations
  for all using (public.is_admin()) with check (public.is_admin());

-- app_settings: readable by anyone (no secrets belong here), admin-writable.
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select using (true);

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ads: the public sees live ads only; owners see their own in any state.
drop policy if exists ads_select on public.ads;
create policy ads_select on public.ads
  for select using (
    (status = 'approved' and expires_at > now())
    or user_id = auth.uid()
    or public.is_staff()
  );

drop policy if exists ads_insert on public.ads;
create policy ads_insert on public.ads
  for insert with check (user_id = auth.uid() or public.is_staff());

drop policy if exists ads_update on public.ads;
create policy ads_update on public.ads
  for update using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

drop policy if exists ads_delete on public.ads;
create policy ads_delete on public.ads
  for delete using (user_id = auth.uid() or public.is_admin());

-- ad_images follow the visibility of their parent ad.
drop policy if exists ad_images_select on public.ad_images;
create policy ad_images_select on public.ad_images
  for select using (
    exists (
      select 1 from public.ads a
      where a.id = ad_images.ad_id
        and ((a.status = 'approved' and a.expires_at > now())
             or a.user_id = auth.uid()
             or public.is_staff())
    )
  );

drop policy if exists ad_images_write on public.ad_images;
create policy ad_images_write on public.ad_images
  for all using (
    exists (select 1 from public.ads a
            where a.id = ad_images.ad_id and (a.user_id = auth.uid() or public.is_staff()))
  )
  with check (
    exists (select 1 from public.ads a
            where a.id = ad_images.ad_id and (a.user_id = auth.uid() or public.is_staff()))
  );

-- =========================================================================
-- Maintenance
-- =========================================================================

-- Called on a schedule (Phase 5) to retire ads past their expiry date.
create or replace function public.expire_stale_ads()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected int;
begin
  update public.ads
     set status = 'expired'
   where status = 'approved'
     and expires_at <= now();
  get diagnostics affected = row_count;

  update public.ads
     set is_featured = false, featured_until = null
   where is_featured and featured_until <= now();

  return affected;
end;
$$;

-- ----- end 0001_core_schema.sql -----

-- ----- begin 0002_seed_reference_data.sql -----
-- =============================================================================
-- Shree Classified — Phase 1: reference data
--
-- Categories mirror the sections that already run in the printed paper
-- (recruitment, admissions, property, trade notices). Locations cover Haridwar
-- district, matching the print circulation area; adding a city later is an
-- INSERT, not a migration.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- ------------------------------------------------------- app settings ----
insert into public.app_settings (key, value, description) values
  ('site.legal_name',   '"Shree Advertising & Marketing"'::jsonb, 'Registered business name.'),
  ('site.brand_name',   '"Shree Classified"'::jsonb,              'Consumer-facing platform name.'),
  ('site.tagline',      '"Roorkee''s classified marketplace — in print every week, online every day"'::jsonb, 'Short descriptor used in headers and metadata.'),
  ('site.address',      '"S-17, Avas Vikas Colony, Opp. Telephone Exchange, Roorkee, Uttarakhand 247667"'::jsonb, 'Office address.'),
  ('site.phones',       '["9719419913","9897638912"]'::jsonb,     'Office contact numbers, 10-digit.'),
  ('site.whatsapp',     '"919719419913"'::jsonb,                  'WhatsApp number including country code, digits only.'),
  ('site.email',        '"shreerke@gmail.com"'::jsonb,            'Office email address.'),
  ('site.print_day',    '"Saturday"'::jsonb,                      'Day the printed edition is published.'),
  ('ads.default_duration_days', '30'::jsonb, 'How long an approved advertisement stays live.'),
  ('ads.max_images',            '8'::jsonb,  'Maximum images per advertisement.'),
  ('ads.free_per_month',        '2'::jsonb,  'Free advertisements a user may publish each month.')
on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      updated_at = now();

-- -------------------------------------------------------- categories ----
-- Top level.
insert into public.categories (slug, name, description, icon, sort_order) values
  ('jobs',          'Jobs',              'Vacancies, walk-in interviews and staff requirements across Roorkee.', 'briefcase', 10),
  ('property',      'Property',          'Houses, shops, plots and rentals for sale and lease.',                  'building',  20),
  ('vehicles',      'Vehicles',          'Cars, two-wheelers, commercial vehicles and spares.',                   'car',       30),
  ('education',     'Education',         'Admissions, coaching classes, tuitions and study material.',            'graduation',40),
  ('services',      'Services',          'Local trades, repairs, catering, travel and professional services.',    'wrench',    50),
  ('business',      'Business & Trade',  'Businesses for sale, machinery, wholesale and trade notices.',          'store',     60),
  ('buy-sell',      'Buy & Sell',        'Electronics, furniture, mobiles and household goods.',                  'tag',       70),
  ('matrimonial',   'Matrimonial',       'Marriage proposals.',                                                    'heart',     80),
  ('announcements', 'Announcements',     'Lost and found, public notices and tenders.',                            'megaphone', 90)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      icon = excluded.icon,
      sort_order = excluded.sort_order;

-- Second level.
insert into public.categories (parent_id, slug, name, sort_order)
select p.id, v.slug, v.name, v.sort_order
from (values
  ('jobs',      'jobs-full-time',        'Full Time',              10),
  ('jobs',      'jobs-part-time',        'Part Time',              20),
  ('jobs',      'jobs-walk-in',          'Walk-in Interview',      30),
  ('jobs',      'jobs-work-from-home',   'Work From Home',         40),
  ('jobs',      'jobs-wanted',           'Job Wanted',             50),

  ('property',  'property-house-sale',   'House for Sale',         10),
  ('property',  'property-house-rent',   'House for Rent',         20),
  ('property',  'property-plots',        'Plots & Land',           30),
  ('property',  'property-commercial',   'Shops & Commercial',     40),
  ('property',  'property-pg-hostel',    'PG & Hostel',            50),

  ('vehicles',  'vehicles-cars',         'Cars',                   10),
  ('vehicles',  'vehicles-bikes',        'Bikes & Scooters',       20),
  ('vehicles',  'vehicles-commercial',   'Commercial Vehicles',    30),
  ('vehicles',  'vehicles-spares',       'Spare Parts & Accessories', 40),

  ('education', 'education-admissions',  'Admissions',             10),
  ('education', 'education-coaching',    'Coaching & Tuition',     20),
  ('education', 'education-books',       'Books & Study Material', 30),

  ('services',  'services-home',         'Home & Repairs',         10),
  ('services',  'services-events',       'Events & Catering',      20),
  ('services',  'services-health',       'Health & Wellness',      30),
  ('services',  'services-travel',       'Travel & Transport',     40),
  ('services',  'services-professional', 'Professional Services',  50),

  ('business',  'business-for-sale',     'Business for Sale',      10),
  ('business',  'business-machinery',    'Machinery & Equipment',  20),
  ('business',  'business-wholesale',    'Wholesale & Supply',     30),

  ('buy-sell',  'buy-sell-mobiles',      'Mobiles & Tablets',      10),
  ('buy-sell',  'buy-sell-electronics',  'Electronics & Appliances', 20),
  ('buy-sell',  'buy-sell-furniture',    'Furniture & Home',       30),
  ('buy-sell',  'buy-sell-other',        'Everything Else',        40),

  ('matrimonial', 'matrimonial-bride',   'Bride Wanted',           10),
  ('matrimonial', 'matrimonial-groom',   'Groom Wanted',           20),

  ('announcements', 'announcements-lost-found', 'Lost & Found',    10),
  ('announcements', 'announcements-notice',     'Public Notice',   20),
  ('announcements', 'announcements-tender',     'Tenders',         30)
) as v(parent_slug, slug, name, sort_order)
join public.categories p on p.slug = v.parent_slug and p.parent_id is null
on conflict (slug) do update
  set name = excluded.name,
      sort_order = excluded.sort_order,
      parent_id = excluded.parent_id;

-- --------------------------------------------------------- locations ----
insert into public.locations (slug, name, kind, sort_order)
values ('haridwar-district', 'Haridwar District', 'district', 10)
on conflict (slug) do update set name = excluded.name;

insert into public.locations (parent_id, slug, name, kind, sort_order)
select d.id, v.slug, v.name, 'city'::public.location_kind, v.sort_order
from (values
  ('roorkee',     'Roorkee',      10),
  ('haridwar',    'Haridwar',     20),
  ('manglaur',    'Manglaur',     30),
  ('bhagwanpur',  'Bhagwanpur',   40),
  ('landhaura',   'Landhaura',    50),
  ('jwalapur',    'Jwalapur',     60),
  ('laksar',      'Laksar',       70),
  ('piran-kaliyar', 'Piran Kaliyar', 80),
  ('narsan',      'Narsan',       90)
) as v(slug, name, sort_order)
cross join (select id from public.locations where slug = 'haridwar-district') d
on conflict (slug) do update
  set name = excluded.name, sort_order = excluded.sort_order, parent_id = excluded.parent_id;

-- Roorkee localities that already appear in the printed classifieds.
insert into public.locations (parent_id, slug, name, kind, sort_order)
select c.id, v.slug, v.name, 'area'::public.location_kind, v.sort_order
from (values
  ('roorkee-civil-lines',     'Civil Lines',        10),
  ('roorkee-malviya-chowk',   'Malviya Chowk',      20),
  ('roorkee-avas-vikas',      'Avas Vikas Colony',  30),
  ('roorkee-bt-ganj',         'B.T. Ganj',          40),
  ('roorkee-amber-talab',     'Amber Talab',        50),
  ('roorkee-ramnagar',        'Ramnagar',           60),
  ('roorkee-solani-puram',    'Solani Puram',       70),
  ('roorkee-ganeshpur',       'Ganeshpur',          80),
  ('roorkee-dehradun-road',   'Dehradun Road',      90),
  ('roorkee-manglaur-road',   'Manglaur Road',     100),
  ('roorkee-rampur-chungi',   'Rampur Chungi',     110),
  ('roorkee-iit-campus',      'IIT Roorkee Campus',120)
) as v(slug, name, sort_order)
cross join (select id from public.locations where slug = 'roorkee') c
on conflict (slug) do update
  set name = excluded.name, sort_order = excluded.sort_order, parent_id = excluded.parent_id;

-- ----- end 0002_seed_reference_data.sql -----

-- ----- begin 0003_browse_views.sql -----
-- =============================================================================
-- Shree Classified — Phase 1: aggregate views for browse surfaces
--
-- `security_invoker = true` makes each view run with the privileges of the
-- caller, so the row-level security policies on `ads` still apply. Without it a
-- view would silently leak counts of unapproved advertisements.
-- =============================================================================

create or replace view public.category_ad_counts
with (security_invoker = true) as
  select
    c.id            as category_id,
    c.slug,
    c.parent_id,
    count(a.id)     as live_ad_count
  from public.categories c
  left join public.ads a
    on a.category_id = c.id
   and a.status = 'approved'
   and a.expires_at > now()
  where c.is_active
  group by c.id, c.slug, c.parent_id;

comment on view public.category_ad_counts is
  'Live advertisement count per category. Respects RLS via security_invoker.';

create or replace view public.location_ad_counts
with (security_invoker = true) as
  select
    l.id        as location_id,
    l.slug,
    l.parent_id,
    count(a.id) as live_ad_count
  from public.locations l
  left join public.ads a
    on a.location_id = l.id
   and a.status = 'approved'
   and a.expires_at > now()
  where l.is_active
  group by l.id, l.slug, l.parent_id;

comment on view public.location_ad_counts is
  'Live advertisement count per location. Respects RLS via security_invoker.';

grant select on public.category_ad_counts to anon, authenticated;
grant select on public.location_ad_counts to anon, authenticated;

-- ----- end 0003_browse_views.sql -----

-- ----- begin 0004_advertisement_kinds_and_packages.sql -----
-- =============================================================================
-- Shree Classified — Phase 6: both kinds of advertisement, and packages
--
-- Phase 1 modelled the classified strip only. The submission form built in
-- Phase 5 collects two different things, and they are genuinely different:
--
--   * a CLASSIFIED is text in a section — it has a category, a price and
--     photographs, and the advertiser writes it themselves;
--   * a DISPLAY advertisement is a designed block — it has an organisation
--     behind it, artwork supplied as JPG or PDF, and no category and no price,
--     because the office quotes it by size.
--
-- They share a table rather than being split in two, because everything that
-- matters about them is shared: ownership, moderation, expiry, the audit
-- trail, reports. What differs is carried by `kind`, by a nullable
-- `category_id`, and by `display_ad_details` for the handful of fields only a
-- display advertisement has.
--
-- Two things move from the client to the database here, both because a client
-- cannot be trusted with them:
--
--   * the SLUG, which is derived from the title and the database-issued
--     reference, so two submissions arriving at the same instant cannot
--     collide and nobody can choose their own URL;
--   * the PRICE of a package, which is copied from the package record at
--     insert. What a package costs is never read from the request.
-- =============================================================================

-- ------------------------------------------------------------- enums ------
do $$ begin create type public.ad_kind as enum ('classified', 'display'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------- packages ------
create table if not exists public.packages (
  id                text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name              text not null check (char_length(btrim(name)) between 2 and 60),
  summary           text not null check (char_length(btrim(summary)) between 2 and 200),
  features          jsonb not null default '[]'::jsonb,
  -- Paise, so money is never a float. NULL means "the office has not given us
  -- a rate yet" — the interface says exactly that rather than showing a zero.
  price_paise       integer check (price_paise is null or price_paise >= 0),
  -- NULL falls back to ads.default_duration_days.
  duration_days     integer check (duration_days is null or duration_days between 1 and 365),
  max_images        integer not null default 8 check (max_images between 0 and 20),
  featured_eligible boolean not null default false,
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint packages_features_is_array check (jsonb_typeof(features) = 'array')
);

comment on table public.packages is
  'What an advertiser can buy. Prices live here, never in the client, so a submission can name a package but never name its price.';

drop trigger if exists packages_set_updated_at on public.packages;
create trigger packages_set_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();

-- Mirrors src/config/packages.ts. Prices are deliberately NULL: Shree
-- Advertising quote their rates from the office and have not published them,
-- so putting a number here would show a customer a price nobody agreed to.
insert into public.packages (id, name, summary, features, price_paise, max_images, featured_eligible, sort_order) values
  ('basic', 'Basic', 'A standard listing in its section.',
   '["Listed in its category","Appears in search and filters","Contact details as you chose them"]'::jsonb,
   null, 4, false, 10),
  ('standard', 'Standard', 'Enhanced visibility within the section.',
   '["Everything in Basic","Highlighted card in listings","Photographs shown at a larger size"]'::jsonb,
   null, 8, false, 20),
  ('premium', 'Premium', 'Featured placement.',
   '["Everything in Standard","Considered for the featured band on the homepage","Considered for the printed edition"]'::jsonb,
   null, 8, true, 30)
on conflict (id) do update
  set name = excluded.name,
      summary = excluded.summary,
      features = excluded.features,
      max_images = excluded.max_images,
      featured_eligible = excluded.featured_eligible,
      sort_order = excluded.sort_order;

-- ------------------------------------------------- new columns on ads ------
alter table public.ads
  add column if not exists kind public.ad_kind not null default 'classified',
  add column if not exists package_id text references public.packages (id) on delete restrict,
  -- The second consent box on the contact step. Phase 1 stored only
  -- `show_phone`; the form asks separately about WhatsApp, and an advertiser
  -- who declines it means it.
  add column if not exists show_whatsapp boolean not null default true,
  -- What the package cost when this advertisement was taken. Copied from the
  -- package record by trigger; never accepted from a request.
  add column if not exists package_price_paise integer
    check (package_price_paise is null or package_price_paise >= 0);

-- A display advertisement has no category: the office places it by size, not
-- by section. Classifieds still must have one.
alter table public.ads alter column category_id drop not null;

alter table public.ads drop constraint if exists ads_classified_has_category;
alter table public.ads add constraint ads_classified_has_category
  check (kind <> 'classified' or category_id is not null);

-- A display advertisement is often submitted as artwork with only a line of
-- explanation, so the 20-character floor applies to classified copy only.
alter table public.ads drop constraint if exists ads_description_check;
alter table public.ads drop constraint if exists ads_description_length;
alter table public.ads add constraint ads_description_length check (
  case
    when kind = 'display' then char_length(btrim(description)) <= 5000
    else char_length(btrim(description)) between 20 and 5000
  end
);

-- Only classifieds carry a price or a package.
alter table public.ads drop constraint if exists ads_display_has_no_price;
alter table public.ads add constraint ads_display_has_no_price
  check (kind <> 'display' or (price is null and package_id is null));

create index if not exists ads_kind_idx on public.ads (kind, status, published_at desc);

-- ------------------------------------------------------ slug issuance ------
create or replace function public.slugify(p_text text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select btrim(
    regexp_replace(
      regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'),
      '(^-+)|(-+$)', '', 'g'),
    '-');
$$;

comment on function public.slugify(text) is
  'ASCII slug fragment. Devanagari and other non-ASCII copy reduces to the empty string, which assign_ad_slug() then falls back from.';

/*
 * The slug is issued here, never by the client.
 *
 * Shape: <title fragment>-<reference>, e.g. office-assistant-required-sc100001.
 * The reference is allocated by a sequence, so the slug is unique by
 * construction — no retry loop, and two submissions in the same millisecond
 * cannot collide. A Hindi title reduces to nothing under slugify(), in which
 * case the reference alone is the slug and the page is still reachable.
 *
 * INSERT only. A title edited later keeps the original URL.
 */
create or replace function public.assign_ad_slug()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  fragment text := left(public.slugify(new.title), 80);
begin
  fragment := btrim(fragment, '-');
  if fragment = '' then
    new.slug := lower(new.reference);
  else
    new.slug := fragment || '-' || lower(new.reference);
  end if;
  return new;
end;
$$;

drop trigger if exists ads_assign_slug on public.ads;
create trigger ads_assign_slug
  before insert on public.ads
  for each row execute function public.assign_ad_slug();

-- One advertisement per URL.
create unique index if not exists ads_slug_unique_idx on public.ads (slug);

-- --------------------------------------------------- package pricing ------
/*
 * Copies the rate from the package record at insert.
 *
 * This is the whole of "the price comes from the server". The submission names
 * a package; what that package costs is looked up here, inside the database,
 * where the request cannot reach it.
 */
create or replace function public.stamp_ad_package_price()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.package_id is null then
    new.package_price_paise := null;
  else
    select p.price_paise into new.package_price_paise
      from public.packages p
     where p.id = new.package_id and p.is_active;
    if not found then
      raise exception 'Unknown or inactive package %', new.package_id
        using errcode = 'foreign_key_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ads_stamp_package_price on public.ads;
create trigger ads_stamp_package_price
  before insert on public.ads
  for each row execute function public.stamp_ad_package_price();

-- ------------------------------------------- display advertisement ------
create table if not exists public.display_ad_details (
  ad_id             uuid primary key references public.ads (id) on delete cascade,
  organisation_name text not null check (char_length(btrim(organisation_name)) between 2 and 100),
  website           text check (website is null or website ~* '^https?://[^\s]+$'),
  notes             text check (notes is null or char_length(notes) <= 500),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.display_ad_details is
  'The fields only a display advertisement has. Kept beside `ads` rather than as nullable columns on it, so a classified can never carry half of them.';

drop trigger if exists display_ad_details_set_updated_at on public.display_ad_details;
create trigger display_ad_details_set_updated_at
  before update on public.display_ad_details
  for each row execute function public.set_updated_at();

create or replace function public.guard_display_details_kind()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.ads a where a.id = new.ad_id and a.kind = 'display') then
    raise exception 'Display details belong to a display advertisement'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists display_ad_details_guard_kind on public.display_ad_details;
create trigger display_ad_details_guard_kind
  before insert or update on public.display_ad_details
  for each row execute function public.guard_display_details_kind();

-- ------------------------------------------------------------ artwork ------
create table if not exists public.ad_artwork (
  id           uuid primary key default gen_random_uuid(),
  ad_id        uuid not null references public.ads (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) between 3 and 400),
  file_name    text not null check (char_length(btrim(file_name)) between 1 and 200),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size    integer not null check (byte_size > 0 and byte_size <= 15 * 1024 * 1024),
  sort_order   integer not null default 0 check (sort_order >= 0),
  created_at   timestamptz not null default now(),
  constraint ad_artwork_position_unique unique (ad_id, sort_order) deferrable initially immediate
);

comment on table public.ad_artwork is
  'Artwork for a display advertisement. Private: a campaign that has not run yet is commercially sensitive, so this is never readable by the public, unlike ad_images.';

create index if not exists ad_artwork_ad_idx on public.ad_artwork (ad_id, sort_order);

insert into public.app_settings (key, value, description) values
  ('ads.max_artwork_files', '4'::jsonb, 'Maximum artwork files per display advertisement.')
on conflict (key) do update
  set value = excluded.value, description = excluded.description, updated_at = now();

create or replace function public.enforce_ad_artwork_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  max_files int := public.setting_int('ads.max_artwork_files', 4);
begin
  if (select count(*) from public.ad_artwork where ad_id = new.ad_id) >= max_files then
    raise exception 'A display advertisement may have at most % artwork files', max_files
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists ad_artwork_enforce_limit on public.ad_artwork;
create trigger ad_artwork_enforce_limit
  before insert on public.ad_artwork
  for each row execute function public.enforce_ad_artwork_limit();

-- =========================================================================
-- Row level security
-- =========================================================================
alter table public.packages           enable row level security;
alter table public.display_ad_details enable row level security;
alter table public.ad_artwork         enable row level security;

drop policy if exists packages_select on public.packages;
create policy packages_select on public.packages
  for select using (is_active or public.is_staff());

drop policy if exists packages_write on public.packages;
create policy packages_write on public.packages
  for all using (public.is_admin()) with check (public.is_admin());

-- Display details follow the visibility of their advertisement.
drop policy if exists display_ad_details_select on public.display_ad_details;
create policy display_ad_details_select on public.display_ad_details
  for select using (
    exists (
      select 1 from public.ads a
      where a.id = display_ad_details.ad_id
        and ((a.status = 'approved' and a.expires_at > now())
             or a.user_id = auth.uid()
             or public.is_staff())
    )
  );

drop policy if exists display_ad_details_write on public.display_ad_details;
create policy display_ad_details_write on public.display_ad_details
  for all using (
    exists (select 1 from public.ads a
            where a.id = display_ad_details.ad_id and (a.user_id = auth.uid() or public.is_staff()))
  )
  with check (
    exists (select 1 from public.ads a
            where a.id = display_ad_details.ad_id and (a.user_id = auth.uid() or public.is_staff()))
  );

-- Artwork is owner-and-staff only, even once the advertisement is live. The
-- published advertisement is the rendered page; the source files are not part
-- of it.
drop policy if exists ad_artwork_select on public.ad_artwork;
create policy ad_artwork_select on public.ad_artwork
  for select using (
    exists (select 1 from public.ads a
            where a.id = ad_artwork.ad_id and (a.user_id = auth.uid() or public.is_staff()))
  );

drop policy if exists ad_artwork_write on public.ad_artwork;
create policy ad_artwork_write on public.ad_artwork
  for all using (
    exists (select 1 from public.ads a
            where a.id = ad_artwork.ad_id and (a.user_id = auth.uid() or public.is_staff()))
  )
  with check (
    exists (select 1 from public.ads a
            where a.id = ad_artwork.ad_id and (a.user_id = auth.uid() or public.is_staff()))
  );

grant select on public.packages to anon, authenticated;
grant select, insert, update, delete on public.display_ad_details, public.ad_artwork to authenticated;

-- ----- end 0004_advertisement_kinds_and_packages.sql -----

-- ----- begin 0005_payments_reports_favourites.sql -----
-- =============================================================================
-- Shree Classified — Phase 6: payments, reports and favourites
--
-- The payment provider itself is Phase 5 of the plan and is not built. What is
-- built is the record a provider would settle against, because the shape of
-- that record decides whether the integration can be got wrong later:
--
--   * the AMOUNT is copied from the advertisement's stamped package price, not
--     from whoever creates the row. A client that could name an amount could
--     name one rupee.
--   * only staff or a trusted server connection may mark a payment paid. The
--     advertiser can read their own receipts and nothing else.
--
-- Reports are the other direction: anyone reading the site, signed in or not,
-- may flag an advertisement, but only staff may read the queue — a report says
-- something about the reporter as well as the advertisement.
-- =============================================================================

do $$ begin create type public.payment_status as enum ('created', 'pending', 'paid', 'failed', 'refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.report_reason as enum ('spam', 'fraud', 'incorrect', 'offensive', 'unavailable', 'other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.report_status as enum ('open', 'reviewing', 'actioned', 'dismissed'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------- payments ------
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  ad_id               uuid not null references public.ads (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  package_id          text not null references public.packages (id) on delete restrict,
  amount_paise        integer not null check (amount_paise >= 0),
  currency            text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  status              public.payment_status not null default 'created',
  provider            text check (provider is null or char_length(btrim(provider)) between 2 and 40),
  provider_order_id   text,
  provider_payment_id text,
  failure_reason      text,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint payments_paid_has_timestamp check (status <> 'paid' or paid_at is not null),
  constraint payments_failed_has_reason check (
    status <> 'failed' or btrim(coalesce(failure_reason, '')) <> ''
  )
);

comment on table public.payments is
  'One row per attempt to pay for an advertisement. The amount is stamped from the advertisement, never accepted from the caller.';

create index if not exists payments_ad_idx   on public.payments (ad_id, created_at desc);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create unique index if not exists payments_provider_order_idx
  on public.payments (provider, provider_order_id)
  where provider_order_id is not null;

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

/*
 * A payment belongs to the advertisement's owner and costs what the
 * advertisement's package cost. Both are read from the advertisement rather
 * than from the row being inserted.
 *
 * While pricing is unconfigured every package costs NULL, which stamps zero —
 * a placed order with nothing to collect. That is the honest reading: the
 * office quotes the rate, and until they have, no amount is due.
 */
create or replace function public.stamp_payment_amount()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ad_owner   uuid;
  ad_package text;
  ad_price   integer;
begin
  select a.user_id, a.package_id, a.package_price_paise
    into ad_owner, ad_package, ad_price
    from public.ads a where a.id = new.ad_id;

  if not found then
    raise exception 'Unknown advertisement %', new.ad_id using errcode = 'foreign_key_violation';
  end if;
  if ad_package is null then
    raise exception 'That advertisement carries no package to pay for'
      using errcode = 'check_violation';
  end if;

  new.user_id      := ad_owner;
  new.package_id   := ad_package;
  new.amount_paise := coalesce(ad_price, 0);
  return new;
end;
$$;

drop trigger if exists payments_stamp_amount on public.payments;
create trigger payments_stamp_amount
  before insert on public.payments
  for each row execute function public.stamp_payment_amount();

/*
 * Settlement is staff business.
 *
 * An advertiser may not move a payment to `paid` — that is what a payment
 * provider's verified webhook does, through the service-role key, which is a
 * trusted connection. Nor may anyone edit an amount after the fact, or
 * reassign a payment to another advertisement.
 */
create or replace function public.guard_payment_settlement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_staff() or public.is_trusted_connection() then
    return new;
  end if;

  if new.amount_paise is distinct from old.amount_paise
     or new.ad_id is distinct from old.ad_id
     or new.user_id is distinct from old.user_id
     or new.package_id is distinct from old.package_id then
    raise exception 'A payment cannot be re-priced or reassigned'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Only Shree Classified can change the status of a payment'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_guard_settlement on public.payments;
create trigger payments_guard_settlement
  before update on public.payments
  for each row execute function public.guard_payment_settlement();

-- ----------------------------------------------------------- reports ------
create table if not exists public.ad_reports (
  id          uuid primary key default gen_random_uuid(),
  ad_id       uuid not null references public.ads (id) on delete cascade,
  -- Null for a reader who is not signed in. Reporting must not require an
  -- account, or the advertisements most worth reporting never get reported.
  reporter_id uuid references public.profiles (id) on delete set null,
  reason      public.report_reason not null,
  details     text check (details is null or char_length(details) <= 1000),
  status      public.report_status not null default 'open',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint ad_reports_reviewed_together check (
    (reviewed_by is null) = (reviewed_at is null)
  ),
  constraint ad_reports_closed_is_reviewed check (
    status in ('open', 'reviewing') or reviewed_at is not null
  )
);

comment on table public.ad_reports is
  'Reader reports awaiting moderation. Readable by staff only: a report identifies its reporter as much as the advertisement.';

create index if not exists ad_reports_queue_idx on public.ad_reports (status, created_at) where status in ('open', 'reviewing');
create index if not exists ad_reports_ad_idx on public.ad_reports (ad_id, created_at desc);

-- One report per signed-in reader per advertisement. Anonymous reports are not
-- constrained this way because there is nothing honest to key them on.
create unique index if not exists ad_reports_one_per_reporter_idx
  on public.ad_reports (ad_id, reporter_id)
  where reporter_id is not null;

/*
 * A reporter may only report as themselves, and may not open a report that is
 * already resolved or assign it to a moderator.
 */
create or replace function public.guard_ad_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_staff() or public.is_trusted_connection() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.reporter_id is distinct from auth.uid() then
      raise exception 'A report cannot be filed on behalf of someone else'
        using errcode = 'insufficient_privilege';
    end if;
    if new.status <> 'open' or new.reviewed_by is not null or new.reviewed_at is not null then
      raise exception 'A new report is opened, not resolved'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  raise exception 'Only Shree Classified staff can act on a report'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists ad_reports_guard on public.ad_reports;
create trigger ad_reports_guard
  before insert or update on public.ad_reports
  for each row execute function public.guard_ad_report();

-- -------------------------------------------------------- favourites ------
create table if not exists public.favourites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  ad_id      uuid not null references public.ads (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, ad_id)
);

comment on table public.favourites is
  'A reader''s saved advertisements. Private to that reader — who saved what is not an advertiser statistic.';

create index if not exists favourites_ad_idx on public.favourites (ad_id);

-- =========================================================================
-- Row level security
-- =========================================================================
alter table public.payments    enable row level security;
alter table public.ad_reports  enable row level security;
alter table public.favourites  enable row level security;

-- Payments: an advertiser reads their own receipts. Nothing else.
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (user_id = auth.uid() or public.is_staff());

-- An advertiser may start a payment against their own advertisement; the
-- amount is stamped by trigger, so starting one decides nothing.
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert with check (
    public.is_staff()
    or exists (select 1 from public.ads a where a.id = payments.ad_id and a.user_id = auth.uid())
  );

-- The owner may touch their own payment row — attaching the provider's order
-- id when a checkout is opened, for instance — but guard_payment_settlement()
-- is what decides what they may actually change, and it is neither the amount
-- nor the status. Shutting the owner out here instead would put the whole
-- guarantee in one policy line, and the day someone loosened that line to let
-- a checkout write its order id, re-pricing would come back with it.
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments
  for delete using (public.is_admin());

-- Reports: write-only for the public, readable by staff.
drop policy if exists ad_reports_insert on public.ad_reports;
create policy ad_reports_insert on public.ad_reports
  for insert with check (
    (reporter_id is null or reporter_id = auth.uid())
    and exists (
      select 1 from public.ads a
      where a.id = ad_reports.ad_id and a.status = 'approved' and a.expires_at > now()
    )
  );

drop policy if exists ad_reports_select on public.ad_reports;
create policy ad_reports_select on public.ad_reports
  for select using (public.is_staff() or (reporter_id is not null and reporter_id = auth.uid()));

drop policy if exists ad_reports_update on public.ad_reports;
create policy ad_reports_update on public.ad_reports
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists ad_reports_delete on public.ad_reports;
create policy ad_reports_delete on public.ad_reports
  for delete using (public.is_admin());

-- Favourites: the owner, and nobody else — not even staff.
drop policy if exists favourites_select on public.favourites;
create policy favourites_select on public.favourites
  for select using (user_id = auth.uid());

drop policy if exists favourites_write on public.favourites;
create policy favourites_write on public.favourites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- UPDATE is granted at the table so that a moderator can work the queue; the
-- policies above are what actually decide who may use it.
grant select, insert, update on public.payments to authenticated;
grant insert on public.ad_reports to anon, authenticated;
grant select, update on public.ad_reports to authenticated;
grant select, insert, update, delete on public.favourites to authenticated;

-- ----- end 0005_payments_reports_favourites.sql -----

-- ----- begin 0006_storage_and_audit_trail.sql -----
-- =============================================================================
-- Shree Classified — Phase 6: storage buckets, and the audit trail
--
-- STORAGE
-- Ownership is carried by the path, not by a column: every object is stored at
--     <user id>/<advertisement id>/<file>
-- and the policies below compare the first path segment against auth.uid().
-- That is the whole of storage authorisation, and it holds even if a bug in the
-- application uploads to the wrong place — the upload simply fails.
--
-- Two buckets, because the two kinds of file are not equally public:
--   ad-images   public  — photographs that appear on a published advertisement
--   ad-artwork  private — a display advertiser's own design, frequently a PDF
--                         and frequently a campaign that has not run yet
--
-- AUDIT TRAIL
-- Append-only, and enforced as such: UPDATE and DELETE are revoked and a
-- trigger raises on either. An audit trail somebody can quietly edit is
-- decoration. Rows are written by SECURITY DEFINER triggers, so the actor
-- cannot choose what is recorded about them, and `actor_id` is read from the
-- verified token rather than supplied.
-- =============================================================================

-- ----------------------------------------------------------- buckets ------
insert into storage.buckets (id, name, public) values
  ('ad-images',  'ad-images',  true),
  ('ad-artwork', 'ad-artwork', false)
on conflict (id) do update set public = excluded.public;

alter table storage.objects enable row level security;

-- Photographs on a published advertisement are public to read.
drop policy if exists ad_images_public_read on storage.objects;
create policy ad_images_public_read on storage.objects
  for select using (bucket_id = 'ad-images');

-- Artwork is readable only by the advertiser who uploaded it, and by staff.
drop policy if exists ad_artwork_owner_read on storage.objects;
create policy ad_artwork_owner_read on storage.objects
  for select using (
    bucket_id = 'ad-artwork'
    and (
      (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
      or public.is_staff()
    )
  );

-- Writing: only into your own folder, in either bucket.
drop policy if exists ad_files_owner_insert on storage.objects;
create policy ad_files_owner_insert on storage.objects
  for insert with check (
    bucket_id in ('ad-images', 'ad-artwork')
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
    -- <user id>/<ad id>/<file>: a flat upload into the bucket root is refused.
    and array_length(storage.foldername(name), 1) >= 3
  );

drop policy if exists ad_files_owner_update on storage.objects;
create policy ad_files_owner_update on storage.objects
  for update using (
    bucket_id in ('ad-images', 'ad-artwork')
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('ad-images', 'ad-artwork')
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists ad_files_owner_delete on storage.objects;
create policy ad_files_owner_delete on storage.objects
  for delete using (
    bucket_id in ('ad-images', 'ad-artwork')
    and (
      (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
      or public.is_staff()
    )
  );

grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;

-- --------------------------------------------------------- audit log ------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  -- Deliberately not a foreign key. A deleted account must not be able to
  -- erase who did what, and an ON DELETE SET NULL would be an UPDATE against
  -- an append-only table.
  actor_id    uuid,
  action      text not null check (char_length(btrim(action)) between 3 and 60),
  entity      text not null check (char_length(btrim(entity)) between 3 and 40),
  entity_id   uuid,
  summary     text,
  before      jsonb,
  after       jsonb
);

comment on table public.audit_log is
  'Append-only record of decisions that change what the public sees or what someone is allowed to do. Writable only by the triggers below; UPDATE and DELETE raise.';

create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id, occurred_at desc);
create index if not exists audit_log_actor_idx  on public.audit_log (actor_id, occurred_at desc);

create or replace function public.refuse_audit_rewrite()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'The audit trail is append-only'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.refuse_audit_rewrite();

create or replace function public.write_audit(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_summary text,
  p_before jsonb,
  p_after jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, summary, before, after)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_summary, p_before, p_after);
$$;

-- --------------------------------------------------------- what we log ----

-- Advertisements: creation, every status change, and featured placement.
create or replace function public.audit_ad_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
      format('%s moved from %s to %s', new.reference, old.status, new.status),
      jsonb_build_object('status', old.status, 'rejection_reason', old.rejection_reason),
      jsonb_build_object('status', new.status, 'rejection_reason', new.rejection_reason));
  end if;

  if new.is_featured is distinct from old.is_featured then
    perform public.write_audit(
      'ad.featured_changed', 'advertisement', new.id,
      format('%s featured placement %s', new.reference,
             case when new.is_featured then 'granted' else 'withdrawn' end),
      jsonb_build_object('is_featured', old.is_featured, 'featured_until', old.featured_until),
      jsonb_build_object('is_featured', new.is_featured, 'featured_until', new.featured_until));
  end if;

  return new;
end;
$$;

drop trigger if exists ads_audit on public.ads;
create trigger ads_audit
  after insert or update on public.ads
  for each row execute function public.audit_ad_change();

-- Profiles: role grants and blocks, which are the two things that change what
-- a person is allowed to do.
create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role then
    perform public.write_audit(
      'profile.role_changed', 'profile', new.id,
      format('role changed from %s to %s', old.role, new.role),
      jsonb_build_object('role', old.role), jsonb_build_object('role', new.role));
  end if;
  if new.is_blocked is distinct from old.is_blocked then
    perform public.write_audit(
      'profile.block_changed', 'profile', new.id,
      case when new.is_blocked then 'account blocked' else 'account unblocked' end,
      jsonb_build_object('is_blocked', old.is_blocked),
      jsonb_build_object('is_blocked', new.is_blocked));
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after update on public.profiles
  for each row execute function public.audit_profile_change();

-- Payments: every settlement state, because this is the money.
create or replace function public.audit_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(
      'payment.created', 'payment', new.id,
      format('%s paise due for package %s', new.amount_paise, new.package_id),
      null, jsonb_build_object('status', new.status, 'amount_paise', new.amount_paise));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.write_audit(
      'payment.status_changed', 'payment', new.id,
      format('payment moved from %s to %s', old.status, new.status),
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status, 'provider_payment_id', new.provider_payment_id));
  end if;
  return new;
end;
$$;

drop trigger if exists payments_audit on public.payments;
create trigger payments_audit
  after insert or update on public.payments
  for each row execute function public.audit_payment_change();

-- Reports: how a moderator resolved a complaint.
create or replace function public.audit_report_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    perform public.write_audit(
      'report.status_changed', 'report', new.id,
      format('report moved from %s to %s', old.status, new.status),
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists ad_reports_audit on public.ad_reports;
create trigger ad_reports_audit
  after update on public.ad_reports
  for each row execute function public.audit_report_change();

-- =========================================================================
-- Row level security
-- =========================================================================
alter table public.audit_log enable row level security;

-- Staff read the trail. Nobody writes to it directly — the triggers above are
-- SECURITY DEFINER and run as the owner, so they are unaffected by this.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select using (public.is_staff());

revoke insert, update, delete on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- ----- end 0006_storage_and_audit_trail.sql -----

-- ----- begin 0007_moderation_guard_and_public_views.sql -----
-- =============================================================================
-- Shree Classified — Phase 6: closing the moderation hole, and the read path
--
-- WHAT WAS WRONG
-- The Phase 1 moderation guard carried over `user_id`, `is_featured` and
-- `status` for an ordinary advertiser, and stopped there. It did not carry
-- over `expires_at`, `published_at` or `view_count`. An owner could therefore
-- send
--     update ads set expires_at = now() + interval '10 years' where id = ...
-- against their own live advertisement and keep it on the site indefinitely
-- without paying for a renewal, or write their own view count. Every one of
-- those columns is now carried over from the old row unless the caller is
-- staff or a trusted server connection.
--
-- View counting was the reason the hole was easy to miss: incrementing a
-- counter is an ordinary UPDATE by an ordinary visitor. It now goes through
-- record_ad_view(), which raises a transaction-local flag the guard
-- recognises, so the one legitimate write to view_count is named rather than
-- permitted by omission.
--
-- THE READ PATH
-- Contact columns are revoked from anon and authenticated at the table, and
-- three views say in SQL who may see what:
--     public_ads      approved, unexpired, phone shown only where consented
--     owner_ads       your own advertisements, every column
--     moderation_ads  every advertisement, for staff
-- The interface cannot get consent wrong, because it is never handed the
-- number it would have to hide. Contact email is in none of the public
-- columns at all: it is how the office reaches an advertiser, not a way for
-- readers to reach them.
-- =============================================================================

-- ------------------------------------------------- view counting flag ------
/*
 * `ads` gets its own updated_at trigger so that counting a view does not make
 * an advertisement look edited. Every other table keeps the shared helper.
 */
create or replace function public.touch_ad_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('shree.counting_view', true), '') = '1' then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists ads_set_updated_at on public.ads;
create trigger ads_set_updated_at
  before update on public.ads
  for each row execute function public.touch_ad_updated_at();

/*
 * Counts one view.
 *
 * SECURITY DEFINER because an anonymous reader has no right to update an
 * advertisement, and should not be given one. The transaction-local flag does
 * two jobs: it tells the moderation guard that this particular change to
 * view_count is the counter rather than an advertiser editing their own
 * statistics, and it makes the call idempotent within a request, so a page
 * that renders an advertisement twice still counts one view.
 */
create or replace function public.record_ad_view(p_ad_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  marker text := 'shree.viewed_' || replace(p_ad_id::text, '-', '');
begin
  if coalesce(current_setting(marker, true), '') = '1' then
    return;
  end if;
  perform set_config(marker, '1', true);

  perform set_config('shree.counting_view', '1', true);
  update public.ads
     set view_count = view_count + 1
   where id = p_ad_id
     and status = 'approved'
     and expires_at > now();
  perform set_config('shree.counting_view', '', true);
end;
$$;

revoke all on function public.record_ad_view(uuid) from public;
grant execute on function public.record_ad_view(uuid) to anon, authenticated;

-- --------------------------------------------- the hardened guard ------
create or replace function public.guard_ad_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  counting_view boolean := coalesce(current_setting('shree.counting_view', true), '') = '1';
begin
  if public.is_staff() or public.is_trusted_connection() then
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

  -- The hole this migration closes: how long an advertisement runs, when it
  -- went live, what it cost, and how many people have seen it.
  new.published_at         := old.published_at;
  new.expires_at           := old.expires_at;
  new.package_price_paise  := old.package_price_paise;
  if not counting_view then
    new.view_count := old.view_count;
  elsif new.view_count is distinct from old.view_count + 1 then
    -- The counter increments by one. Anything else is not the counter.
    new.view_count := old.view_count;
  end if;

  -- Changing package is a re-quote, which is the office's decision.
  if new.package_id is distinct from old.package_id then
    raise exception 'The package is set when the advertisement is taken'
      using errcode = 'insufficient_privilege';
  end if;

  -- An owner may withdraw, resubmit or mark sold; never self-approve.
  -- Retiring an advertisement genuinely past its expiry stays permitted so the
  -- scheduled sweep does not need staff rights.
  if new.status is distinct from old.status
     and new.status not in ('draft', 'pending', 'sold')
     and not (new.status = 'expired'
              and old.expires_at is not null
              and old.expires_at <= now()) then
    raise exception 'Only Shree Classified staff can set an advertisement to %', new.status
      using errcode = 'insufficient_privilege';
  end if;

  if old.status = 'rejected' and new.status is distinct from 'rejected' then
    new.rejection_reason := null;
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

-- -------------------------------------------- contact columns locked ------
/*
 * A table-level SELECT grant covers every column, so the grant is replaced
 * with an explicit column list. `contact_phone`, `contact_whatsapp` and
 * `contact_email` are not in it: they are reachable only through the views
 * below, which decide per row what consent allows.
 */
revoke select on public.ads from anon, authenticated;
grant select (
  id, reference, slug, kind, user_id, category_id, location_id,
  title, description, price, price_type, attributes,
  contact_name, show_phone, show_whatsapp,
  status, rejection_reason, is_featured, featured_until,
  published_at, expires_at, view_count,
  package_id, package_price_paise,
  created_at, updated_at, search_vector
) on public.ads to anon, authenticated;

/*
 * The same reasoning applied to INSERT.
 *
 * Identity (`reference`, `slug`), placement (`is_featured`, `featured_until`),
 * lifetime (`published_at`, `expires_at`), readership (`view_count`), the
 * stamped price and a rejection reason are all issued by the database or by
 * staff. Taking the privilege away is stronger than checking for it in a
 * trigger, because there is then nothing to check: the statement is refused
 * before any row is built.
 */
revoke insert on public.ads from anon, authenticated;
grant insert (
  kind, user_id, category_id, location_id,
  title, description, price, price_type, attributes,
  contact_name, contact_phone, contact_whatsapp, contact_email,
  show_phone, show_whatsapp, status, package_id
) on public.ads to authenticated;

-- ------------------------------------------------------------- views ------
/*
 * These views are deliberately NOT `security_invoker`. They run as their
 * owner, which is how they can read the contact columns the caller cannot, and
 * it is why each one states its whole audience in its WHERE clause rather than
 * leaning on the policies underneath.
 */
drop view if exists public.public_ads;
create view public.public_ads as
  select
    a.id,
    a.reference,
    a.slug,
    a.kind,
    a.title,
    a.description,
    a.price,
    a.price_type,
    a.attributes,
    a.category_id,
    c.slug          as category_slug,
    c.name          as category_name,
    a.location_id,
    l.slug          as location_slug,
    l.name          as location_name,
    a.contact_name,
    -- Consent, honoured here rather than in a component.
    case when a.show_phone    then a.contact_phone    end as contact_phone,
    case when a.show_whatsapp then a.contact_whatsapp end as contact_whatsapp,
    a.is_featured,
    a.published_at,
    a.updated_at,
    a.expires_at,
    a.view_count,
    a.package_id,
    a.search_vector,
    -- The listing page filters and sorts entirely in SQL, so the two things it
    -- filters on that are not columns of `ads` are computed here rather than
    -- by fetching every advertisement and deciding in TypeScript.
    (select count(*) from public.ad_images i where i.ad_id = a.id)::int as image_count,
    (select i.storage_path from public.ad_images i
      where i.ad_id = a.id order by i.sort_order, i.created_at limit 1) as cover_image_path,
    case
      when a.is_featured then 'featured'
      when exists (select 1 from public.ad_images i where i.ad_id = a.id) then 'photo'
      when a.package_id in ('standard', 'premium') then 'boxed'
      else 'line'
    end as format
  from public.ads a
  left join public.categories c on c.id = a.category_id
  left join public.locations  l on l.id = a.location_id
  where a.status = 'approved'
    and a.expires_at > now();

comment on view public.public_ads is
  'The only advertisement rows the public may read. Approved and unexpired, with a telephone number present only where the advertiser consented, and no contact email at all.';

drop view if exists public.owner_ads;
create view public.owner_ads as
  select a.*, c.slug as category_slug, c.name as category_name,
         l.slug as location_slug, l.name as location_name
  from public.ads a
  left join public.categories c on c.id = a.category_id
  left join public.locations  l on l.id = a.location_id
  where auth.uid() is not null
    and a.user_id = auth.uid();

comment on view public.owner_ads is
  'Your own advertisements, in any state, with the contact details you gave. Empty for an unauthenticated caller.';

drop view if exists public.moderation_ads;
create view public.moderation_ads as
  select a.*, p.full_name as advertiser_name, p.email as advertiser_email,
         c.slug as category_slug, l.slug as location_slug,
         (select count(*) from public.ad_reports r
           where r.ad_id = a.id and r.status in ('open', 'reviewing')) as open_report_count
  from public.ads a
  join public.profiles p on p.id = a.user_id
  left join public.categories c on c.id = a.category_id
  left join public.locations  l on l.id = a.location_id
  where public.is_staff();

comment on view public.moderation_ads is
  'Every advertisement, for the review queue. Returns nothing unless the caller is staff.';

-- These views read as their owner, so anything they were writable through
-- would bypass the policies underneath. None of them is auto-updatable today;
-- revoking says so in the schema rather than relying on that staying true.
revoke all on public.public_ads, public.owner_ads, public.moderation_ads from anon, authenticated;
grant select on public.public_ads to anon, authenticated;
grant select on public.owner_ads, public.moderation_ads to authenticated;

-- The browse counts should only count what the public can actually see.
create or replace view public.category_ad_counts
with (security_invoker = true) as
  select
    c.id        as category_id,
    c.slug,
    c.parent_id,
    count(a.id) as live_ad_count
  from public.categories c
  left join public.public_ads a on a.category_id = c.id
  where c.is_active
  group by c.id, c.slug, c.parent_id;

create or replace view public.location_ad_counts
with (security_invoker = true) as
  select
    l.id        as location_id,
    l.slug,
    l.parent_id,
    count(a.id) as live_ad_count
  from public.locations l
  left join public.public_ads a on a.location_id = l.id
  where l.is_active
  group by l.id, l.slug, l.parent_id;

grant select on public.category_ad_counts, public.location_ad_counts to anon, authenticated;

-- ----- end 0007_moderation_guard_and_public_views.sql -----

