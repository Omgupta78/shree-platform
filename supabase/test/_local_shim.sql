-- LOCAL VALIDATION ONLY. Not applied to Supabase, which provides all of this.
--
-- Stands in for the parts of a Supabase project that live outside the `public`
-- schema: the auth schema, the storage schema, and the two roles PostgREST
-- connects as. The migrations grant to those roles and attach policies to
-- storage.objects, so without them the migrations cannot even be applied here.

-- ------------------------------------------------------------- roles ------
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------- auth ------
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid', true), '')::uuid $$;

-- ----------------------------------------------------------- storage ------
-- Supabase Storage keeps objects in `storage.objects`, keyed by bucket and by
-- a path whose first segment is the owning user's id. `storage.foldername()`
-- splits that path; the policies in 0006 compare its first element against
-- auth.uid(), which is the whole of storage ownership.
create schema if not exists storage;
create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets (id) on delete cascade,
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now(),
  constraint storage_objects_bucket_name_unique unique (bucket_id, name)
);
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$ select string_to_array(name, '/') $$;

grant usage on schema auth, storage to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- ------------------------------------------------- default privileges -----
-- Supabase hands `anon` and `authenticated` table, sequence and function
-- privileges on everything created in `public`, and relies on row-level
-- security to decide what those privileges actually reach. Mirroring that here
-- matters: a migration that narrows a privilege (0007 revokes SELECT and
-- INSERT on `ads` and re-grants a column list) is only being tested if the
-- broad grant existed in the first place.
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
