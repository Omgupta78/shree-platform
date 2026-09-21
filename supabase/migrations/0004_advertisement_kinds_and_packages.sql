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
