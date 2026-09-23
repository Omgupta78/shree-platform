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

-- Row-level security on `storage.objects`.
--
-- On hosted Supabase this is already enabled and the table is owned by
-- `supabase_storage_admin`, so a bare `alter table` fails with "must be owner
-- of table objects" even as `postgres`. The guard makes the statement a no-op
-- where it is already done, and the handler keeps a project that somehow has
-- it off -- and will not let us turn it on -- from failing the whole migration
-- when the policies below are what actually matter.
do $$
begin
  if not exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity
  ) then
    alter table storage.objects enable row level security;
  end if;
exception
  when insufficient_privilege then
    raise notice 'storage.objects: RLS left as found (not owner)';
end $$;

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
    -- <user id>/<ad id>/<file>. `storage.foldername()` returns the FOLDER
    -- parts only -- the file name is not one of them -- so that path is two
    -- elements, not three. Two is therefore the minimum that still refuses a
    -- file dropped loose at the user's root (`<user id>/<file>`, one element)
    -- or at the bucket root (none).
    and coalesce(array_length(storage.foldername(name), 1), 0) >= 2
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
