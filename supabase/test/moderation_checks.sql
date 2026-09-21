-- =============================================================================
-- LOCAL VALIDATION ONLY — not applied to Supabase.
--
-- Phase 7. The moderation workflow: who may decide, which moves are allowed,
-- what gets written down, and what the public can see at each step.
--
-- User ids are this file's own — the d/e/f series. `rls_checks.sql` owns 1/2/3
-- and `backend_checks.sql` owns a/b/c. Sharing an id between suites once made
-- "an ordinary user" an administrator and every privilege check in that file
-- passed for the wrong reason.
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

delete from public.test_assertions;
insert into public.test_assertions values (0);

-- ---------------------------------------------------------------- cast ----
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-4000-8000-000000000001', 'deepa@example.com', '{"full_name":"Deepa Rawat","phone":"9812345680"}'),
  ('e0000000-0000-4000-8000-000000000002', 'eshan@example.com', '{"full_name":"Eshan Kumar","phone":"9812345681"}'),
  ('f0000000-0000-4000-8000-000000000003', 'mod2@example.com',  '{"full_name":"Office Moderator"}');

update public.profiles set role = 'moderator'
 where id = 'f0000000-0000-4000-8000-000000000003';

do $$
declare n int;
begin
  select count(*) into n from public.profiles
   where id in ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002')
     and role = 'user';
  assert n = 2, format('the two advertisers should be ordinary users, %s are', n);
  perform public.ok('the moderation suite''s advertisers are ordinary users');
end $$;

-- =========================================================================
-- 1. The transition table
-- =========================================================================
do $$
begin
  assert public.is_permitted_ad_transition('pending', 'approved');
  assert public.is_permitted_ad_transition('pending', 'changes_requested');
  assert public.is_permitted_ad_transition('changes_requested', 'pending');
  assert public.is_permitted_ad_transition('approved', 'pending');
  assert public.is_permitted_ad_transition('approved', 'expired');
  perform public.ok('the moves a submission actually makes are permitted');

  -- A refusal that can be undone in one step is not a refusal.
  assert not public.is_permitted_ad_transition('rejected', 'approved');
  -- Bringing a finished advertisement back to life is a renewal, and renewals
  -- are paid for. The route back is through the queue.
  assert not public.is_permitted_ad_transition('expired', 'approved');
  -- Nothing goes live without passing through review.
  assert not public.is_permitted_ad_transition('draft', 'approved');
  -- An advertisement cannot finish a run it never started.
  assert not public.is_permitted_ad_transition('pending', 'expired');
  assert not public.is_permitted_ad_transition('approved', 'draft');
  perform public.ok('the moves that would skip review or undo a decision are refused');

  -- An ordinary edit changes no status, and must not have to be listed.
  assert public.is_permitted_ad_transition('approved', 'approved');
  perform public.ok('leaving the status alone is always permitted');
end $$;

-- =========================================================================
-- 2. A submission, reviewed
-- =========================================================================
set role authenticated;
select set_config('test.uid', 'd0000000-0000-4000-8000-000000000001', false);

do $$
declare
  cat uuid := (select id from public.categories where slug = 'property-house-rent');
  loc uuid := (select id from public.locations  where slug = 'roorkee-civil-lines');
  ad  uuid;
begin
  insert into public.ads (user_id, category_id, location_id, title, description,
                          price, price_type, contact_name, contact_phone,
                          show_phone, status, package_id)
  values ('d0000000-0000-4000-8000-000000000001', cat, loc,
          'Two room house on rent near the canal',
          'A two room house with a separate entrance is available on rent from the first of next month.',
          9000, 'fixed', 'Deepa Rawat', '9812345680', true, 'pending', 'basic')
  returning id into ad;
  perform public.ok('an advertiser submits an advertisement for review');

  -- The advertiser cannot send their own advertisement back to themselves.
  begin
    update public.ads set status = 'changes_requested',
                          rejection_reason = 'I have changed my mind'
     where id = ad;
    raise exception 'FAIL: an advertiser put their own advertisement into changes_requested';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot ask themselves for a change');
  end;

  -- Nor moderate it through the function.
  begin
    perform public.moderate_advertisement(ad, 'approve');
    raise exception 'FAIL: an advertiser moderated their own advertisement';
  exception when insufficient_privilege then
    perform public.ok('moderate_advertisement() refuses anyone who is not staff');
  end;
end $$;

-- ------------------------------------------------------ request changes ----
select set_config('test.uid', 'f0000000-0000-4000-8000-000000000003', false);

do $$
declare
  ad uuid := public.test_ad_id('Two room house on rent near the canal');
  r  record;
  n  int;
begin
  -- A request with nothing in it is worse than silence.
  begin
    perform public.moderate_advertisement(ad, 'request_changes');
    raise exception 'FAIL: a change was requested without saying which change';
  exception when check_violation then
    perform public.ok('asking for a change requires saying what to change');
  end;

  begin
    perform public.moderate_advertisement(ad, 'reject');
    raise exception 'FAIL: an advertisement was rejected with no reason';
  exception when check_violation then
    perform public.ok('rejecting requires a reason');
  end;

  perform public.moderate_advertisement(
    ad, 'request_changes', 'Please tell us the locality.');

  select status, rejection_reason into r from public.ads where id = ad;
  assert r.status = 'changes_requested', format('status was %s', r.status);
  perform public.ok('a moderator can send an advertisement back for a change');

  assert r.rejection_reason = 'Please tell us the locality.',
    format('the message stored was %s', coalesce(r.rejection_reason, 'NULL'));
  perform public.ok('the advertiser is left with the message they were sent');

  -- The note reaches the audit trail, in the same transaction as the change.
  select count(*) into n from public.audit_log
   where entity = 'advertisement' and entity_id = ad
     and action = 'ad.status_changed'
     and after ->> 'note' = 'Please tell us the locality.';
  assert n = 1, format('%s audit entries carried the note, expected 1', n);
  perform public.ok('the decision and the sentence explaining it are recorded together');

  select count(*) into n from public.admin_actions
   where entity_id = ad and previous_status = 'pending'
     and new_status = 'changes_requested' and actor_name = 'Office Moderator';
  assert n = 1, 'admin_actions did not resolve the actor and the two statuses';
  perform public.ok('the activity log names who decided, and from what to what');
end $$;

-- ---------------------------------------------- not public in the meantime --
set role anon;
select set_config('test.uid', '', false);

do $$
declare n int;
begin
  select count(*) into n from public.public_ads
   where title = 'Two room house on rent near the canal';
  assert n = 0, 'an advertisement awaiting a correction was publicly visible';
  perform public.ok('an advertisement sent back for changes is not public');

  begin
    execute 'select count(*) from public.moderation_ads';
    raise exception 'FAIL: an anonymous visitor reached the moderation queue';
  exception when insufficient_privilege then
    perform public.ok('the moderation queue is not granted to an anonymous visitor');
  end;
end $$;

-- ------------------------------------------------- the advertiser edits ----
set role authenticated;
select set_config('test.uid', 'd0000000-0000-4000-8000-000000000001', false);

do $$
declare
  ad uuid := public.test_ad_id('Two room house on rent near the canal');
  r  record;
begin
  update public.ads
     set description = 'A two room house with a separate entrance is available on rent in Civil Lines, Roorkee, from the first of next month.',
         status = 'pending'
   where id = ad;

  select status, rejection_reason into r from public.ads where id = ad;
  assert r.status = 'pending', format('after resubmission the status was %s', r.status);
  perform public.ok('the advertiser can correct the advertisement and send it back');

  assert r.rejection_reason is null, 'the old message was still attached after resubmission';
  perform public.ok('resubmitting clears the message the office had left');
end $$;

-- =========================================================================
-- 3. Approval, and what it makes public
-- =========================================================================
select set_config('test.uid', 'f0000000-0000-4000-8000-000000000003', false);

do $$
declare
  ad uuid := public.test_ad_id('Two room house on rent near the canal');
  r  record;
begin
  perform public.moderate_advertisement(ad, 'approve');

  select status, published_at, expires_at into r from public.ads where id = ad;
  assert r.status = 'approved' and r.published_at is not null and r.expires_at > now(),
    'approval did not issue a publication window';
  perform public.ok('approval publishes and issues a window');
end $$;

set role anon;
select set_config('test.uid', '', false);
do $$
declare n int;
begin
  select count(*) into n from public.public_ads
   where title = 'Two room house on rent near the canal';
  assert n = 1, 'an approved advertisement did not appear in the public view';
  perform public.ok('approval makes the advertisement public at the query layer');
end $$;

-- --------------------------------------------------------- unpublishing ----
set role authenticated;
select set_config('test.uid', 'f0000000-0000-4000-8000-000000000003', false);

do $$
declare
  ad uuid := public.test_ad_id('Two room house on rent near the canal');
  n  int;
begin
  perform public.moderate_advertisement(ad, 'unpublish');
  select count(*) into n from public.ads where id = ad and status = 'pending';
  assert n = 1, 'unpublishing did not return the advertisement to the queue';
  perform public.ok('unpublishing returns an advertisement to the queue rather than deleting it');
end $$;

set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.public_ads
   where title = 'Two room house on rent near the canal';
  assert n = 0, 'an unpublished advertisement was still public';
  perform public.ok('unpublishing removes it from the public view immediately');
end $$;

-- =========================================================================
-- 4. Rejection, restoration, and re-approval after expiry
-- =========================================================================
set role authenticated;
select set_config('test.uid', 'f0000000-0000-4000-8000-000000000003', false);

do $$
declare
  ad uuid := public.test_ad_id('Two room house on rent near the canal');
  r  record;
  n  int;
begin
  perform public.moderate_advertisement(
    ad, 'reject', 'Suspected fraud — the number does not answer.');

  select status, rejection_reason into r from public.ads where id = ad;
  assert r.status = 'rejected' and r.rejection_reason is not null, 'rejection did not stick';
  perform public.ok('a moderator can reject with a reason');

  -- Nothing is deleted by a refusal.
  select count(*) into n from public.ads where id = ad;
  assert n = 1, 'the rejected advertisement was deleted';
  perform public.ok('a rejected advertisement is kept, not deleted');

  begin
    perform public.moderate_advertisement(ad, 'approve');
    raise exception 'FAIL: a rejected advertisement was approved in one step';
  exception when insufficient_privilege then
    perform public.ok('a rejected advertisement cannot be approved without going back to the queue');
  end;

  perform public.moderate_advertisement(ad, 'restore');
  select status, rejection_reason into r from public.ads where id = ad;
  assert r.status = 'pending' and r.rejection_reason is null,
    'restoring did not return it to the queue with a clean slate';
  perform public.ok('restoring puts it back in the queue and clears the refusal');

  -- Re-approval after a run has finished must issue a fresh window, or the
  -- advertisement is approved and finished in the same breath.
  perform public.moderate_advertisement(ad, 'approve');
  update public.ads set expires_at = now() - interval '2 days' where id = ad;
  perform public.expire_stale_ads();
  assert (select status from public.ads where id = ad) = 'expired', 'the sweep did not retire it';

  perform public.moderate_advertisement(ad, 'restore');
  perform public.moderate_advertisement(ad, 'approve');
  select status, expires_at into r from public.ads where id = ad;
  assert r.status = 'approved' and r.expires_at > now(),
    format('re-approval left the expiry at %s', r.expires_at);
  perform public.ok('re-approving after expiry issues a fresh publication window');
end $$;

-- =========================================================================
-- 5. What staff may see, and what they may not
-- =========================================================================
do $$
declare n int;
begin
  select count(*) into n from public.moderation_ads;
  assert n >= 1, 'staff could not read the moderation queue';
  perform public.ok('staff read the moderation queue');

  select count(*) into n from public.moderation_ads
   where advertiser_email = 'deepa@example.com' and contact_phone is not null;
  assert n >= 1, 'the queue did not carry the advertiser''s contact details';
  perform public.ok('the moderation queue carries the contact details the office needs');

  -- The same columns the public view refuses to expose.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'public_ads' and column_name = 'contact_email';
  assert n = 0, 'contact_email leaked into the public view';
  perform public.ok('the office view and the public view remain different views');
end $$;

-- An ordinary advertiser is not staff, whatever page they are on.
select set_config('test.uid', 'e0000000-0000-4000-8000-000000000002', false);
do $$
declare
  ad uuid := public.test_ad_id('Two room house on rent near the canal');
  n  int;
begin
  select count(*) into n from public.moderation_ads;
  assert n = 0, format('an ordinary advertiser read %s rows of the moderation queue', n);
  perform public.ok('the moderation queue is empty for an ordinary account');

  select count(*) into n from public.admin_actions;
  assert n = 0, format('an ordinary advertiser read %s activity entries', n);
  perform public.ok('the activity log is empty for an ordinary account');

  -- `admin_users` is security_invoker, so the profiles policy answers: you
  -- see yourself and nobody else.
  select count(*) into n from public.admin_users;
  assert n = 1, format('an ordinary advertiser saw %s accounts, expected only their own', n);
  perform public.ok('the account list shows an ordinary advertiser only themselves');

  begin
    perform public.admin_dashboard_counts();
    raise exception 'FAIL: an ordinary advertiser read the dashboard';
  exception when insufficient_privilege then
    perform public.ok('the dashboard counts refuse anyone who is not staff');
  end;

  begin
    perform public.moderate_advertisement(ad, 'expire');
    raise exception 'FAIL: an ordinary advertiser expired somebody else''s advertisement';
  exception when insufficient_privilege then
    perform public.ok('an ordinary advertiser cannot moderate an advertisement they do not own');
  end;
end $$;

-- =========================================================================
-- 6. The dashboard counts
-- =========================================================================
select set_config('test.uid', 'f0000000-0000-4000-8000-000000000003', false);
do $$
declare
  approved bigint;
  users    bigint;
  n        int;
begin
  select value into approved from public.admin_dashboard_counts() where metric = 'approved';
  select count(*) into n from public.ads where status = 'approved' and expires_at > now();
  assert approved = n, format('the dashboard said %s live, the table says %s', approved, n);
  perform public.ok('the dashboard counts come from the table, not from a guess');

  select value into users from public.admin_dashboard_counts() where metric = 'users';
  assert users = 3, format('the dashboard counted %s users, expected 3', users);
  perform public.ok('the dashboard counts every account');
end $$;

-- =========================================================================
-- 7. Reports
-- =========================================================================
set role anon;
select set_config('test.uid', '', false);
do $$
declare ad uuid := public.test_ad_id('Two room house on rent near the canal');
begin
  insert into public.ad_reports (ad_id, reporter_id, reason, details)
  values (ad, null, 'fraud', 'The rent quoted is not the rent asked for.');
  perform public.ok('a reader reports the advertisement');
end $$;

set role authenticated;
select set_config('test.uid', 'e0000000-0000-4000-8000-000000000002', false);
do $$
declare report uuid := (select id from public.ad_reports order by created_at desc limit 1);
begin
  begin
    perform public.resolve_ad_report(report, 'dismissed', 'Nothing in it.');
    raise exception 'FAIL: an ordinary advertiser resolved a report';
  exception when insufficient_privilege then
    perform public.ok('resolve_ad_report() refuses anyone who is not staff');
  end;
end $$;

select set_config('test.uid', 'f0000000-0000-4000-8000-000000000003', false);
do $$
declare
  report uuid := (select id from public.ad_reports order by created_at desc limit 1);
  r      record;
  n      int;
begin
  perform public.resolve_ad_report(report, 'reviewing');
  assert (select status from public.ad_reports where id = report) = 'reviewing',
    'a moderator could not pick a report up';
  perform public.ok('a moderator can mark a report as being looked at');

  perform public.resolve_ad_report(report, 'dismissed', 'Rang the advertiser; the rent is as stated.');
  select status, reviewed_by, reviewed_at into r from public.ad_reports where id = report;
  assert r.status = 'dismissed' and r.reviewed_by = auth.uid() and r.reviewed_at is not null,
    'dismissing did not record who did it';
  perform public.ok('resolving a report records who resolved it and when');

  select count(*) into n from public.audit_log
   where entity = 'report' and entity_id = report
     and after ->> 'note' = 'Rang the advertiser; the rent is as stated.';
  assert n = 1, 'the moderator''s note did not reach the audit trail';
  perform public.ok('the note on a report reaches the audit trail');

  begin
    perform public.resolve_ad_report(report, 'open');
    raise exception 'FAIL: a resolved report was reopened';
  exception when check_violation then
    perform public.ok('a report cannot be reopened once it is closed');
  end;

  -- Reporting something never touches the advertisement itself.
  select count(*) into n from public.ads
   where id = public.test_ad_id('Two room house on rent near the canal')
     and status = 'approved';
  assert n = 1, 'a report changed the advertisement';
  perform public.ok('a report on its own changes nothing about the advertisement');
end $$;

-- =========================================================================
-- 8. An edit by the office is recorded as one
-- =========================================================================
do $$
declare
  ad uuid := public.test_ad_id('Two room house on rent near the canal');
  n  int;
begin
  update public.ads
     set title = 'Two room house on rent in Civil Lines'
   where id = ad;

  select count(*) into n from public.audit_log
   where entity = 'advertisement' and entity_id = ad and action = 'ad.edited_by_staff';
  assert n = 1, format('%s entries recorded the office editing the advertisement', n);
  perform public.ok('an edit made by the office is recorded separately from a decision');
end $$;

-- =========================================================================
-- 9. What an advertiser may correct, and what they may not
-- =========================================================================
set role authenticated;
select set_config('test.uid', 'd0000000-0000-4000-8000-000000000001', false);

do $$
declare
  ad  uuid := public.test_ad_id('Two room house on rent in Civil Lines');
  cat uuid := (select id from public.categories where slug = 'property-house-sale');
  r   record;
  n   int;
begin
  -- Editing a live advertisement takes it off the site and returns it to the
  -- queue. The advertiser does not choose this; the guard does it.
  update public.ads set description = 'A two room house with a separate entrance and a covered parking space.'
   where id = ad;
  assert (select status from public.ads where id = ad) = 'pending',
    'editing a live advertisement did not return it to the queue';
  perform public.ok('an advertiser editing a live advertisement sends it back for review');

  -- The correction itself is allowed: title, category, price, contact.
  update public.ads
     set title = 'Two room house on rent, Civil Lines, Roorkee',
         category_id = cat,
         price = 9500,
         contact_name = 'Deepa Rawat',
         show_phone = false
   where id = ad;
  select title, category_id, price, show_phone into r from public.ads where id = ad;
  assert r.price = 9500 and r.category_id = cat and not r.show_phone,
    'the advertiser could not correct their own advertisement';
  perform public.ok('an advertiser can correct the text, the category, the price and the consent');
end $$;

-- A finished advertisement is not the advertiser's to revive.
select set_config('test.uid', 'f0000000-0000-4000-8000-000000000003', false);
do $$
declare ad uuid := public.test_ad_id('Two room house on rent, Civil Lines, Roorkee');
begin
  perform public.moderate_advertisement(ad, 'approve');
  update public.ads set expires_at = now() - interval '1 day' where id = ad;
  perform public.expire_stale_ads();
end $$;

select set_config('test.uid', 'd0000000-0000-4000-8000-000000000001', false);
do $$
declare
  ad uuid := public.test_ad_id('Two room house on rent, Civil Lines, Roorkee');
  n  int;
begin
  assert (select status from public.ads where id = ad) = 'expired', 'the advertisement did not expire';

  begin
    update public.ads set status = 'pending' where id = ad;
    raise exception 'FAIL: an advertiser put a finished advertisement back in the queue';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot put a finished advertisement back in the queue');
  end;

  -- Somebody else's photographs are not theirs to remove either.
  select count(*) into n from public.ad_images;
  delete from public.ad_images
   where ad_id in (select id from public.ads where user_id <> auth.uid());
  assert (select count(*) from public.ad_images) = n,
    'an advertiser deleted a photograph from an advertisement that was not theirs';
  perform public.ok('an advertiser cannot remove photographs from somebody else''s advertisement');
end $$;

select set_config('test.uid', 'e0000000-0000-4000-8000-000000000002', false);
do $$
declare
  ad uuid := public.test_ad_id('Two room house on rent, Civil Lines, Roorkee');
  n  int;
begin
  update public.ads set title = 'Retitled by a complete stranger' where id = ad;
  get diagnostics n = row_count;
  assert n = 0, format('a stranger edited %s rows', n);
  perform public.ok('a stranger cannot edit an advertisement through the same path');
end $$;

-- =========================================================================
-- 10. A correction by the office, and the taxonomy the form relies on
-- =========================================================================
reset role;
select set_config('test.uid', '', false);

do $$
declare n int;
begin
  -- The form offers these two. Until migration 0010 the database had neither,
  -- and choosing one made a submission fail with no explanation.
  select count(*) into n from public.categories where slug = 'others' and is_active;
  assert n = 1, 'the form offers category "others" and the database does not have it';
  select count(*) into n from public.locations where slug = 'nearby' and is_active;
  assert n = 1, 'the form offers location "nearby" and the database does not have it';
  perform public.ok('every category and location the form offers exists in the database');

  select count(*) into n from public.categories where slug = 'announcements';
  assert n = 0, 'the old "announcements" section is still there beside "others"';
  perform public.ok('the renamed section is one row, not two');
end $$;

set role authenticated;
select set_config('test.uid', 'd0000000-0000-4000-8000-000000000001', false);
do $$
declare
  cat uuid := (select id from public.categories where slug = 'property-house-rent');
  loc uuid := (select id from public.locations  where slug = 'roorkee-civil-lines');
begin
  insert into public.ads (user_id, category_id, location_id, title, description,
                          price, price_type, contact_name, contact_phone, status, package_id)
  values ('d0000000-0000-4000-8000-000000000001', cat, loc,
          'SHOP FOR RENT!!! CALL NOW!!!',
          'A ground floor shop of two hundred square feet near the bus stand, suitable for a medical store.',
          15000, 'fixed', 'Deepa Rawat', '9812345680', 'pending', 'basic');
end $$;

-- An advertiser cannot use the office's correction path.
do $$
declare ad uuid := public.test_ad_id('SHOP FOR RENT!!! CALL NOW!!!');
begin
  begin
    perform public.correct_advertisement(
      ad, 'Shop for rent near the bus stand', 'x', null, null, 'tidying');
    raise exception 'FAIL: an advertiser used the office''s correction path';
  exception when insufficient_privilege then
    perform public.ok('correct_advertisement() refuses anyone who is not staff');
  end;
end $$;

select set_config('test.uid', 'f0000000-0000-4000-8000-000000000003', false);
do $$
declare
  ad   uuid := public.test_ad_id('SHOP FOR RENT!!! CALL NOW!!!');
  shop uuid := (select id from public.categories where slug = 'property-commercial');
  loc  uuid := (select id from public.locations  where slug = 'roorkee-civil-lines');
  r    record;
  n    int;
begin
  begin
    perform public.correct_advertisement(
      ad, 'Shop for rent near the bus stand',
      'A ground floor shop of two hundred square feet near the bus stand, suitable for a medical store.',
      coalesce(shop, (select category_id from public.ads where id = ad)), loc, '');
    raise exception 'FAIL: a correction was saved without saying why';
  exception when check_violation then
    perform public.ok('a correction by the office requires a note');
  end;

  perform public.correct_advertisement(
    ad, 'Shop for rent near the bus stand',
    'A ground floor shop of two hundred square feet near the bus stand, suitable for a medical store.',
    coalesce(shop, (select category_id from public.ads where id = ad)), loc,
    'Removed capitals and exclamation marks from the title.');

  -- Through the office's view: `contact_phone` is revoked at the table even for
  -- a moderator, which is the whole point of the column grants in 0007.
  select title, status, price, contact_phone into r from public.moderation_ads where id = ad;
  assert r.title = 'Shop for rent near the bus stand', 'the correction did not save';
  perform public.ok('a moderator can correct formatting');

  assert r.status = 'pending', format('a correction changed the status to %s', r.status);
  perform public.ok('a correction by the office does not change the decision');

  assert r.price = 15000 and r.contact_phone = '9812345680',
    'a correction touched the price or the contact details';
  perform public.ok('a correction leaves the price and the contact details alone');

  select count(*) into n from public.audit_log
   where entity = 'advertisement' and entity_id = ad and action = 'ad.edited_by_staff'
     and summary = 'Removed capitals and exclamation marks from the title.'
     and before ->> 'title' = 'SHOP FOR RENT!!! CALL NOW!!!';
  assert n = 1, 'the correction was not recorded with its note and its before-and-after';
  perform public.ok('a correction is recorded with why, and with what it replaced');

  -- The rejected list shows who decided and when, from the audit trail.
  perform public.moderate_advertisement(ad, 'reject', 'Not a valid advertisement — duplicate.');
  select last_decision_by, last_decision_at into r from public.moderation_ads where id = ad;
  assert r.last_decision_by = 'Office Moderator' and r.last_decision_at is not null,
    'the queue does not say who rejected the advertisement';
  perform public.ok('the queue says who made the last decision, and when');
end $$;

-- The account list carries no telephone numbers.
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'admin_users' and column_name = 'phone';
  assert n = 0, 'admin_users still exposes telephone numbers';
  perform public.ok('the account list does not carry telephone numbers');
end $$;

-- =========================================================================
-- 11. The audit trail still refuses to be rewritten
-- =========================================================================
set role authenticated;
select set_config('test.uid', 'f0000000-0000-4000-8000-000000000003', false);
do $$
declare ad uuid := public.test_ad_id('Two room house on rent, Civil Lines, Roorkee');
begin
  begin
    update public.audit_log set summary = 'nothing to see' where entity_id = ad;
    raise exception 'FAIL: a moderator edited the audit trail';
  exception when insufficient_privilege then
    perform public.ok('a moderator cannot edit the audit trail either');
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
