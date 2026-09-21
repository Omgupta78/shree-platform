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
