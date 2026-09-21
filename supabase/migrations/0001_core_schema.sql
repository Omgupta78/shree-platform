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
