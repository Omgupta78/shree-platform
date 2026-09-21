-- =============================================================================
-- Shree Classified — Phase 7: the form and the database agree on names
--
-- FOUND WHILE AUDITING PHASE 7 AGAINST ITS BRIEF
--
-- The submission form reads its categories and locations from
-- `src/config/categories.ts` and `src/config/locations.ts`. The server action
-- looks each chosen slug up in the database to find its id. Two of the slugs
-- the form offers did not exist in the database:
--
--   category  `others`   — the database called the same section `announcements`
--   location  `nearby`   — "Nearby areas", the catch-all, was never seeded
--
-- An advertiser who chose either got "We could not save the advertisement just
-- now", with nothing to tell them that the choice itself was the problem. The
-- form is the side readers and advertisers see (the slug is in public URLs),
-- so the database moves to match it.
--
-- `announcements` is renamed rather than a second `others` row added beside
-- it: they are the same section of the paper — public notices, tenders, lost
-- and found — and two rows for one section is how a category page ends up
-- half-empty. Its id does not change, so nothing that references it moves.
--
-- A check that every slug the form offers exists in the database now runs in
-- the database-backed end-to-end suite, so this cannot drift apart again
-- without a test failing.
-- =============================================================================

update public.categories
   set slug = 'others',
       name = 'Others',
       description = 'Public notices, tenders, lost and found, and events.'
 where slug = 'announcements';

-- The subcategories keep their own slugs (`announcements-notice` and so on):
-- they are not offered by the form, and renaming them would change their URLs
-- for no benefit.

insert into public.locations (parent_id, slug, name, kind, sort_order)
select d.id, 'nearby', 'Nearby areas', 'city', 1000
  from public.locations d
 where d.slug = 'haridwar-district'
on conflict (slug) do update
  set name = excluded.name, is_active = true;

-- -------------------------------------------- the queue, in more detail ----
/*
 * Two columns the office asked for, and one removed.
 *
 * `last_decision_at` and `last_decision_by` answer "who rejected this, and
 * when" on the rejected list without the page issuing one audit query per row.
 * They are read from the append-only audit trail, so they cannot disagree
 * with it.
 *
 * `moderation_ads` is a definer view gated on `is_staff()`, so reading the
 * audit trail inside it does not widen who can see the audit trail: somebody
 * who is not staff gets no rows from this view at all.
 */
drop view if exists public.moderation_ads;
create view public.moderation_ads as
  select
    a.*,
    p.full_name  as advertiser_name,
    p.email      as advertiser_email,
    p.phone      as advertiser_phone,
    p.created_at as advertiser_since,
    p.is_blocked as advertiser_blocked,
    c.slug       as category_slug,
    c.name       as category_name,
    l.slug       as location_slug,
    l.name       as location_name,
    (select count(*) from public.ad_images i where i.ad_id = a.id)::int  as image_count,
    (select count(*) from public.ad_artwork w where w.ad_id = a.id)::int as artwork_count,
    (select count(*) from public.ad_reports r
      where r.ad_id = a.id and r.status in ('open', 'reviewing'))::int   as open_report_count,
    extract(epoch from (now() - a.created_at))::bigint / 3600            as hours_waiting,
    decision.occurred_at as last_decision_at,
    decision.actor_name  as last_decision_by,
    -- Past its expiry but not yet swept. Not public either way — `public_ads`
    -- checks the date itself — but the office should see it with the finished
    -- ones, not the live ones.
    (a.status = 'approved' and a.expires_at <= now()) as is_lapsed
  from public.ads a
  join public.profiles p on p.id = a.user_id
  left join public.categories c on c.id = a.category_id
  left join public.locations  l on l.id = a.location_id
  left join lateral (
    select log.occurred_at, actor.full_name as actor_name
      from public.audit_log log
      left join public.profiles actor on actor.id = log.actor_id
     where log.entity = 'advertisement'
       and log.entity_id = a.id
       and log.action = 'ad.status_changed'
     order by log.occurred_at desc
     limit 1
  ) decision on true
  where public.is_staff();

comment on view public.moderation_ads is
  'Every advertisement, for the review queue, with the advertiser''s contact details and who last decided on it. Returns nothing unless the caller is staff. Kept separate from public_ads so that an admin page and a public page can never share a data source by accident.';

revoke all on public.moderation_ads from anon, authenticated;
grant select on public.moderation_ads to authenticated;

/*
 * The account list without telephone numbers.
 *
 * The brief asks for name, email, role, joined date, advertisement count and
 * status, and not to expose private information the office has no use for on
 * that page. The number an advertiser gave for an advertisement is on that
 * advertisement's review page, which is where the office would ring from.
 */
drop view if exists public.admin_users;
create view public.admin_users
with (security_invoker = true) as
  select
    p.id,
    p.full_name,
    p.email,
    p.role,
    p.is_blocked,
    p.created_at,
    (select count(*) from public.ads a where a.user_id = p.id)::int as ad_count,
    (select count(*) from public.ads a
      where a.user_id = p.id and a.status = 'approved' and a.expires_at > now())::int as live_ad_count,
    (select max(a.created_at) from public.ads a where a.user_id = p.id) as last_submission_at
  from public.profiles p;

comment on view public.admin_users is
  'Accounts as the office needs to see them — no telephone numbers. security_invoker, so the profiles policy applies: staff see everyone, anybody else sees only themselves.';

revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;

-- ---------------------------------------------- an edit by the office ------
/*
 * What a moderator may correct, and nothing more.
 *
 * The brief: correct obvious formatting and category issues, but do not
 * silently change important advertiser information. So this function takes a
 * title, a description, a category and a location — and deliberately not the
 * price, the contact details or the consent flags. Those are the advertiser's
 * word, and if they are wrong the right move is to ask for a change, not to
 * make one on their behalf.
 *
 * The note is required and lands in the audit trail beside the before-and-
 * after that `audit_ad_change()` already records for a staff edit, so every
 * correction says why it was made. SECURITY INVOKER, so the guard and the
 * row-level policies still apply.
 */
create or replace function public.correct_advertisement(
  p_ad_id       uuid,
  p_title       text,
  p_description text,
  p_category_id uuid,
  p_location_id uuid,
  p_note        text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_staff() then
    raise exception 'Only Shree Classified staff can correct an advertisement'
      using errcode = 'insufficient_privilege';
  end if;
  if note is null then
    raise exception 'A correction needs a note saying what was changed and why'
      using errcode = 'check_violation';
  end if;

  perform set_config('shree.moderation_note', note, true);

  update public.ads
     set title       = p_title,
         description = p_description,
         category_id = p_category_id,
         location_id = p_location_id
   where id = p_ad_id;

  if not found then
    raise exception 'No such advertisement' using errcode = 'no_data_found';
  end if;

  perform set_config('shree.moderation_note', '', true);
end;
$$;

revoke all on function public.correct_advertisement(uuid, text, text, uuid, uuid, text) from public;
grant execute on function public.correct_advertisement(uuid, text, text, uuid, uuid, text) to authenticated;

/*
 * The staff-edit audit entry carries the note too.
 *
 * Replaces the 0009 version of `audit_ad_change()` with the one change that
 * the edit entry's summary is the moderator's note when there is one.
 */
create or replace function public.audit_ad_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  note text := nullif(current_setting('shree.moderation_note', true), '');
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
      coalesce(note, format('%s moved from %s to %s', new.reference, old.status, new.status)),
      jsonb_build_object('status', old.status, 'rejection_reason', old.rejection_reason),
      jsonb_build_object(
        'status', new.status,
        'rejection_reason', new.rejection_reason,
        'reference', new.reference,
        'note', note));
  end if;

  if new.is_featured is distinct from old.is_featured then
    perform public.write_audit(
      'ad.featured_changed', 'advertisement', new.id,
      format('%s featured placement %s', new.reference,
             case when new.is_featured then 'granted' else 'withdrawn' end),
      jsonb_build_object('is_featured', old.is_featured, 'featured_until', old.featured_until),
      jsonb_build_object('is_featured', new.is_featured, 'featured_until', new.featured_until));
  end if;

  if public.is_staff()
     and new.user_id <> auth.uid()
     and (new.title is distinct from old.title
          or new.description is distinct from old.description
          or new.category_id is distinct from old.category_id
          or new.location_id is distinct from old.location_id
          or new.price is distinct from old.price
          or new.attributes is distinct from old.attributes) then
    perform public.write_audit(
      'ad.edited_by_staff', 'advertisement', new.id,
      coalesce(note, format('%s edited by the office', new.reference)),
      jsonb_build_object('title', old.title, 'description', old.description,
                         'category_id', old.category_id, 'location_id', old.location_id,
                         'price', old.price, 'attributes', old.attributes),
      jsonb_build_object('title', new.title, 'description', new.description,
                         'category_id', new.category_id, 'location_id', new.location_id,
                         'price', new.price, 'attributes', new.attributes,
                         'reference', new.reference, 'note', note));
  end if;

  return new;
end;
$$;
