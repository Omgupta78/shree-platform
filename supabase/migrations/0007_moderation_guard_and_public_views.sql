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
