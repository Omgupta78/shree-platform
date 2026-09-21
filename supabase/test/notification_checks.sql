-- =============================================================================
-- LOCAL VALIDATION ONLY — not applied to Supabase.
--
-- Phase 10. Who gets told what, how many times, and who cannot read it.
--
-- The two questions this file exists to keep answered are the two that
-- notification systems get wrong: does the same event tell somebody twice, and
-- can one person read another's post. Everything else here is wording.
--
-- User ids are this file's own — the 3a/3b/3c/3d series.
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

delete from public.test_assertions;
insert into public.test_assertions values (0);

delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data) values
  ('3a000000-0000-4000-8000-000000000001', 'notea@example.com', '{"full_name":"Advertiser A"}'),
  ('3b000000-0000-4000-8000-000000000002', 'noteb@example.com', '{"full_name":"Advertiser B"}'),
  ('3c000000-0000-4000-8000-000000000003', 'notemod@example.com', '{"full_name":"Notify Moderator"}'),
  ('3d000000-0000-4000-8000-000000000004', 'noteadm@example.com', '{"full_name":"Notify Admin"}');

update public.profiles set role = 'moderator' where id = '3c000000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin'     where id = '3d000000-0000-4000-8000-000000000004';
update public.profiles set phone = '9000000031' where id = '3a000000-0000-4000-8000-000000000001';

-- Nothing from earlier suites should be counted here.
delete from public.notifications;

-- =========================================================================
-- 1. Submitting an advertisement tells the advertiser and the office
-- =========================================================================
do $$
declare
  cat uuid := (select id from public.categories where slug = 'property');
  loc uuid := (select id from public.locations  where slug = 'roorkee');
  ad  uuid;
  n   int;
  r   record;
begin
  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, status, package_id)
  values ('3a000000-0000-4000-8000-000000000001', cat, loc, 'Notify A flat',
          'A flat used only by the notification checks. Not a real advertisement.',
          8000, 'fixed', 'Advertiser A', '9000000031', 'pending', 'basic')
  returning id into ad;

  select count(*) into n from public.notifications
   where user_id = '3a000000-0000-4000-8000-000000000001' and type = 'advertisement_submitted';
  assert n = 1, format('the advertiser got %s submission notifications, expected 1', n);
  perform public.ok('submitting an advertisement tells the advertiser');

  select title, body, href, entity_type, is_read into r
    from public.notifications
   where user_id = '3a000000-0000-4000-8000-000000000001' and type = 'advertisement_submitted';
  assert r.href = '/my-ads/' || ad::text, format('the notification points at %s', r.href);
  assert r.entity_type = 'advertisement' and not r.is_read;
  assert r.body like '%' || (select reference from public.ads where id = ad) || '%',
    'the notification does not quote the reference';
  perform public.ok('a notification quotes the reference and points at the advertisement');

  -- Both staff, and only staff.
  select count(*) into n from public.notifications where type = 'staff_advertisement_submitted';
  assert n = 2, format('%s staff were told, expected 2', n);
  perform public.ok('the office is told about a new advertisement, once per staff member');

  select count(*) into n from public.notifications
   where type = 'staff_advertisement_submitted'
     and user_id in ('3a000000-0000-4000-8000-000000000001', '3b000000-0000-4000-8000-000000000002');
  assert n = 0, 'an advertiser received a staff notification';
  perform public.ok('an advertiser is never sent the office''s own notifications');
end $$;

-- =========================================================================
-- 2. A draft tells nobody
-- =========================================================================
do $$
declare
  cat uuid := (select id from public.categories where slug = 'property');
  loc uuid := (select id from public.locations  where slug = 'roorkee');
  before int := (select count(*) from public.notifications);
begin
  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, status, package_id)
  values ('3a000000-0000-4000-8000-000000000001', cat, loc, 'Notify A draft',
          'A draft used only by the notification checks. Not a real advertisement.',
          100, 'fixed', 'Advertiser A', '9000000031', 'draft', 'basic');

  assert (select count(*) from public.notifications) = before,
    'saving a draft raised a notification';
  perform public.ok('a draft nobody has sent us tells nobody');
end $$;

-- =========================================================================
-- 3. The decisions
-- =========================================================================
-- The moderator approves. The checking is done afterwards as a trusted
-- connection, because a moderator CANNOT read an advertiser's notifications —
-- which is the point of section 9 below, and would fail here for the right
-- reason if the assertions were made in their session.
set role authenticated;
select set_config('test.uid', '3c000000-0000-4000-8000-000000000003', false);
select public.moderate_advertisement(public.test_ad_id('Notify A flat'), 'approve');

reset role;
select set_config('test.uid', '', false);
do $$
declare
  ad uuid := public.test_ad_id('Notify A flat');
  r  record;
begin
  select title, body, href into r from public.notifications
   where user_id = '3a000000-0000-4000-8000-000000000001' and type = 'advertisement_approved';
  assert r.title = 'Your advertisement is published', format('the approval was titled: %s', r.title);
  assert r.body like '%runs until%', format('the approval said: %s', r.body);
  perform public.ok('approving an advertisement tells its advertiser, with the date it runs until');

  -- Approving is reached from more than one place; the notification is on the
  -- table, so it does not matter which one was used.
  assert exists (select 1 from public.notifications
                  where type = 'advertisement_approved' and entity_id = ad);
  perform public.ok('the notification is written by the status change itself');
end $$;

do $$
declare
  cat uuid := (select id from public.categories where slug = 'property');
  loc uuid := (select id from public.locations  where slug = 'roorkee');
  ad  uuid;
  r   record;
begin
  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, status, package_id)
  values ('3a000000-0000-4000-8000-000000000001', cat, loc, 'Notify A refused',
          'An advertisement used only by the notification checks. Not a real advertisement.',
          900, 'fixed', 'Advertiser A', '9000000031', 'pending', 'basic')
  returning id into ad;

  perform set_config('test.uid', '3c000000-0000-4000-8000-000000000003', true);
  perform public.moderate_advertisement(ad, 'reject', 'The photograph is unreadable.');
  perform set_config('test.uid', '', true);

  select title, body into r from public.notifications
   where user_id = '3a000000-0000-4000-8000-000000000001' and type = 'advertisement_rejected';
  assert r.body like '%The photograph is unreadable.%',
    format('the refusal did not carry its reason: %s', r.body);
  perform public.ok('a refusal tells the advertiser why');
end $$;

do $$
declare
  cat uuid := (select id from public.categories where slug = 'property');
  loc uuid := (select id from public.locations  where slug = 'roorkee');
  ad  uuid;
  r   record;
begin
  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, status, package_id)
  values ('3a000000-0000-4000-8000-000000000001', cat, loc, 'Notify A changes',
          'An advertisement used only by the notification checks. Not a real advertisement.',
          900, 'fixed', 'Advertiser A', '9000000031', 'pending', 'basic')
  returning id into ad;

  perform set_config('test.uid', '3c000000-0000-4000-8000-000000000003', true);
  perform public.moderate_advertisement(ad, 'request_changes', 'Please add the locality.');
  perform set_config('test.uid', '', true);

  select body, href into r from public.notifications
   where user_id = '3a000000-0000-4000-8000-000000000001'
     and type = 'advertisement_changes_requested';
  assert r.body like '%Please add the locality.%';
  assert r.href = '/my-ads/' || ad::text || '/edit',
    format('changes-requested pointed at %s, expected the edit page', r.href);
  perform public.ok('a request for changes carries the message and links to the edit page');
end $$;

-- =========================================================================
-- 4. Expiring soon: one reminder per run, whatever the sweep does
-- =========================================================================
do $$
declare
  ad    uuid := public.test_ad_id('Notify A flat');
  first int;
  again int;
  r     record;
begin
  update public.ads set expires_at = now() + interval '3 days' where id = ad;

  first := public.notify_expiring_advertisements();
  assert first >= 1, 'the reminder sweep found nothing to remind about';
  perform public.ok('an advertisement inside the expiring window earns a reminder');

  -- The sweep runs daily. It must not remind daily.
  again := public.notify_expiring_advertisements();
  assert again = 0, format('a second sweep sent %s more reminders', again);
  perform public.ok('running the reminder sweep again sends nothing');

  select count(*) into first from public.notifications
   where type = 'advertisement_expiring' and entity_id = ad;
  assert first = 1, format('%s reminders exist for one run', first);
  perform public.ok('one run ending is one reminder, however often the sweep runs');

  select href into r from public.notifications
   where type = 'advertisement_expiring' and entity_id = ad;
  assert r.href = '/my-ads/' || ad::text || '/renew';
  perform public.ok('the reminder links to the renewal page');

  -- A renewal moves the date. That is a different run ending, and worth saying.
  update public.ads set expires_at = now() + interval '5 days' where id = ad;
  again := public.notify_expiring_advertisements();
  assert again = 1, 'moving the expiry date did not earn a fresh reminder';
  perform public.ok('a run with a new end date earns a new reminder');
end $$;

-- =========================================================================
-- 5. Expiry itself
-- =========================================================================
do $$
declare
  ad uuid := public.test_ad_id('Notify A flat');
  n  int;
begin
  update public.ads set expires_at = now() - interval '1 minute' where id = ad;
  perform public.expire_advertisements();

  select count(*) into n from public.notifications
   where type = 'advertisement_expired' and entity_id = ad;
  assert n = 1, format('expiry raised %s notifications, expected 1', n);
  perform public.ok('the expiry sweep tells the advertiser their run has finished');

  -- The sweep is idempotent, and so is what it says.
  perform public.expire_advertisements();
  select count(*) into n from public.notifications
   where type = 'advertisement_expired' and entity_id = ad;
  assert n = 1, format('a second sweep raised %s expiry notifications', n);
  perform public.ok('a second sweep does not tell them again');
end $$;

-- =========================================================================
-- 6. Payments say what was paid, and NOT that it is published
-- =========================================================================
do $$
declare
  ad  uuid := public.test_ad_id('Notify A refused');
  pay uuid;
  r   record;
  n   int;
begin
  update public.packages set price_paise = 19900 where id = 'basic';

  insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
  values (ad, '3a000000-0000-4000-8000-000000000001', 'basic', 1, 'razorpay', 'order_notify_1')
  returning id into pay;

  assert not exists (select 1 from public.notifications where entity_id = pay),
    'raising an order told somebody something';
  perform public.ok('starting a payment tells nobody — nothing has happened yet');

  perform public.settle_payment('razorpay', 'order_notify_1', 'pay_notify_1', 'sig', 19900);

  select title, body into r from public.notifications
   where user_id = '3a000000-0000-4000-8000-000000000001' and type = 'payment_successful';
  assert r.body like '%awaiting review%',
    format('the payment notification did not say the advertisement still waits: %s', r.body);
  assert r.body not like '%live%' and r.body not like '%published%',
    format('the payment notification claimed publication: %s', r.body);
  perform public.ok('a successful payment says the advertisement is awaiting review, not published');

  select count(*) into n from public.notifications where type = 'staff_payment_received';
  assert n = 2, format('%s staff were told about the payment, expected 2', n);
  perform public.ok('the office is told a payment arrived');

  -- The webhook and the browser callback both settle. Only one notification.
  perform public.settle_payment('razorpay', 'order_notify_1', 'pay_notify_1', 'sig', 19900);
  select count(*) into n from public.notifications
   where type = 'payment_successful' and entity_id = pay;
  assert n = 1, format('settling twice raised %s notifications', n);
  perform public.ok('a payment settled twice is announced once');
end $$;

do $$
declare
  ad uuid := public.test_ad_id('Notify A changes');
  n  int;
begin
  insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
  values (ad, '3a000000-0000-4000-8000-000000000001', 'basic', 1, 'razorpay', 'order_notify_2');

  perform public.close_payment('razorpay', 'order_notify_2', 'cancelled');
  select count(*) into n from public.notifications where type = 'payment_cancelled';
  assert n = 1, format('cancelling raised %s notifications', n);
  perform public.ok('a cancelled checkout is told apart from a failed one');

  -- A fresh attempt: Phase 9's state machine refuses cancelled -> failed, and
  -- a retry after a cancellation is a new order anyway.
  insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
  values (ad, '3a000000-0000-4000-8000-000000000001', 'basic', 1, 'razorpay', 'order_notify_2b');

  perform public.close_payment('razorpay', 'order_notify_2b', 'failed', 'Card declined.');
  select count(*) into n from public.notifications where type = 'payment_failed';
  assert n = 1, format('a failed payment raised %s notifications', n);
  assert (select body from public.notifications where type = 'payment_failed')
         like '%Nothing has been charged%';
  perform public.ok('a failed payment says nothing has been charged');
end $$;

-- =========================================================================
-- 7. The outbox: channels follow preferences, and in_app is never queued
-- =========================================================================
do $$
declare
  note uuid := (select id from public.notifications
                 where user_id = '3a000000-0000-4000-8000-000000000001'
                   and type = 'payment_successful');
  n    int;
begin
  assert not exists (select 1 from public.notification_deliveries
                      where notification_id = note and channel = 'in_app'),
    'an in-app delivery was queued';
  perform public.ok('the in-app notification is not queued to itself');

  select count(*) into n from public.notification_deliveries
   where notification_id = note and channel = 'email' and status = 'queued';
  assert n = 1, format('%s email deliveries queued, expected 1', n);
  perform public.ok('email is queued by default');

  select count(*) into n from public.notification_deliveries
   where notification_id = note and channel = 'whatsapp';
  assert n = 0, format('%s WhatsApp deliveries queued for somebody who never asked', n);
  perform public.ok('WhatsApp is not queued for somebody who has not asked for it');
end $$;

do $$
declare
  ad   uuid := public.test_ad_id('Notify A changes');
  note uuid;
  n    int;
begin
  insert into public.notification_preferences (user_id, email_payment_updates, whatsapp_payment_updates)
  values ('3a000000-0000-4000-8000-000000000001', false, true)
  on conflict (user_id) do update
    set email_payment_updates = false, whatsapp_payment_updates = true;

  insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
  values (ad, '3a000000-0000-4000-8000-000000000001', 'basic', 1, 'razorpay', 'order_notify_3');
  perform public.settle_payment('razorpay', 'order_notify_3', 'pay_notify_3', 'sig', 19900);

  select id into note from public.notifications
   where type = 'payment_successful'
     and entity_id = (select id from public.payments where provider_order_id = 'order_notify_3');

  select count(*) into n from public.notification_deliveries
   where notification_id = note and channel = 'email';
  assert n = 0, 'email was queued after the advertiser turned it off';
  perform public.ok('turning email off for payments stops the email being queued');

  select count(*) into n from public.notification_deliveries
   where notification_id = note and channel = 'whatsapp';
  assert n = 1, 'WhatsApp was not queued after the advertiser asked for it';
  perform public.ok('asking for WhatsApp queues WhatsApp');

  -- The in-app row is written regardless. Turning a channel off is not a way
  -- to stop being told why your advertisement was refused.
  assert note is not null;
  perform public.ok('the in-app notification is written whatever the channels say');
end $$;

-- A recipient with nothing to send to is not queued at all.
do $$
declare
  cat  uuid := (select id from public.categories where slug = 'property');
  loc  uuid := (select id from public.locations  where slug = 'roorkee');
  note uuid;
  n    int;
begin
  update public.profiles set email = null where id = '3b000000-0000-4000-8000-000000000002';

  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, status, package_id)
  values ('3b000000-0000-4000-8000-000000000002', cat, loc, 'Notify B flat',
          'An advertisement used only by the notification checks. Not a real advertisement.',
          700, 'fixed', 'Advertiser B', '9000000032', 'pending', 'basic');

  select id into note from public.notifications
   where user_id = '3b000000-0000-4000-8000-000000000002' and type = 'advertisement_submitted';
  select count(*) into n from public.notification_deliveries where notification_id = note;
  assert n = 0, format('%s deliveries queued for somebody with no address', n);
  perform public.ok('a channel with nowhere to send is not queued, rather than queued and failed');
end $$;

-- =========================================================================
-- 8. The worker: claiming, retrying, and giving up
-- =========================================================================
do $$
declare
  claimed record;
  n       int;
  outcome public.notification_delivery_status;
begin
  select count(*) into n from public.claim_notification_deliveries(50);
  assert n >= 1, 'the worker claimed nothing from a queue with work in it';
  perform public.ok('the worker claims queued deliveries');

  -- Claimed work is held, so a second worker running at the same time does
  -- not send the same email.
  select count(*) into n from public.claim_notification_deliveries(50);
  assert n = 0, format('a second worker claimed %s of the same rows', n);
  perform public.ok('a claimed delivery is not handed to a second worker');
end $$;

do $$
declare
  d      uuid;
  outcome public.notification_delivery_status;
  row_   public.notification_deliveries%rowtype;
begin
  select id into d from public.notification_deliveries where channel = 'email' limit 1;

  outcome := public.complete_notification_delivery(d, 'failed', 'Provider timed out.');
  assert outcome = 'queued', format('one failure gave up straight away: %s', outcome);
  select * into row_ from public.notification_deliveries where id = d;
  assert row_.scheduled_at > now(), 'a failed delivery was not held back before retrying';
  perform public.ok('a failed delivery is retried later, not immediately');

  -- Exhaust it.
  update public.notification_deliveries set attempts = 4, scheduled_at = now() where id = d;
  outcome := public.complete_notification_delivery(d, 'failed', 'Provider timed out.');
  assert outcome = 'failed', format('the delivery did not give up: %s', outcome);
  select * into row_ from public.notification_deliveries where id = d;
  assert row_.failed_at is not null and row_.error = 'Provider timed out.';
  perform public.ok('a delivery that keeps failing is given up on, with its reason kept');

  -- And stays given up on.
  outcome := public.complete_notification_delivery(d, 'sent');
  assert outcome = 'failed', 'a settled delivery was re-opened';
  perform public.ok('a settled delivery is not changed by a late report');
end $$;

do $$
declare
  d      uuid;
  outcome public.notification_delivery_status;
begin
  select d2.id into d from public.notification_deliveries d2 where d2.status = 'queued' limit 1;
  outcome := public.complete_notification_delivery(d, 'sent');
  assert outcome = 'sent';
  assert (select sent_at from public.notification_deliveries where id = d) is not null;
  perform public.ok('a sent delivery records when it was sent');
end $$;

-- =========================================================================
-- 9. One advertiser cannot read or touch another's
-- =========================================================================
-- One of advertiser A's notifications, noted down while we can still see it.
-- Inside advertiser B's session the row is not merely unreadable, it does not
-- exist — which is what the assertions below are for, and also why the id has
-- to be captured out here.
reset role;
select set_config('test.uid', '', false);
select set_config('test.a_note',
  (select id::text from public.notifications
    where user_id = '3a000000-0000-4000-8000-000000000001' limit 1), false);

set role authenticated;
select set_config('test.uid', '3b000000-0000-4000-8000-000000000002', false);

do $$
declare
  a_note uuid := current_setting('test.a_note', true)::uuid;
  n      int;
begin
  assert a_note is not null, 'no notification of advertiser A''s was found to try';
  select count(*) into n from public.notifications
   where user_id = '3a000000-0000-4000-8000-000000000001';
  assert n = 0, format('advertiser B read %s of advertiser A''s notifications', n);
  perform public.ok('an advertiser cannot read another''s notifications');

  select count(*) into n from public.my_notifications
   where entity_type = 'payment';
  assert n = 0, 'advertiser B saw advertiser A''s payment notifications in the view';
  perform public.ok('the view returns only your own');

  assert public.mark_notification_read(a_note) = false,
    'advertiser B marked advertiser A''s notification read';
  perform public.ok('an advertiser cannot mark another''s notification read');

  begin
    perform 1 from public.notification_deliveries;
    raise exception 'FAIL: an advertiser read the outbox';
  exception when insufficient_privilege then
    perform public.ok('the outbox is unreadable by a signed-in advertiser');
  end;

  begin
    perform public.claim_notification_deliveries(10);
    raise exception 'FAIL: an advertiser claimed the send queue';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot claim work from the send queue');
  end;
end $$;

-- Confirmed from outside B's session: the row really was left alone.
reset role;
select set_config('test.uid', '', false);
do $$
begin
  assert (select is_read from public.notifications
           where id = current_setting('test.a_note', true)::uuid) = false,
    'advertiser A''s notification was marked read by advertiser B after all';
  perform public.ok('the notification advertiser B tried to mark is still unread');
end $$;

-- =========================================================================
-- 10. Marking your own
-- =========================================================================
set role authenticated;
select set_config('test.uid', '3a000000-0000-4000-8000-000000000001', false);
do $$
declare
  note uuid := (select id from public.my_notifications where not is_read limit 1);
  n    int;
  left_unread int;
begin
  assert public.mark_notification_read(note) = true;
  assert (select is_read from public.my_notifications where id = note) = true;
  assert (select read_at from public.my_notifications where id = note) is not null;
  perform public.ok('an advertiser marks their own notification read, and it records when');

  -- Marking a read one again is not an error, and not a second read time.
  assert public.mark_notification_read(note) = false;
  perform public.ok('marking an already-read notification changes nothing');

  select count(*) into n from public.my_notifications where not is_read;
  assert n > 0, 'nothing was left to mark';
  left_unread := public.mark_all_notifications_read();
  assert left_unread = n, format('mark-all reported %s, expected %s', left_unread, n);
  assert (select count(*) from public.my_notifications where not is_read) = 0;
  perform public.ok('mark all read clears the advertiser''s own unread notifications, and only theirs');
end $$;

-- Advertiser B's own were not touched by A's mark-all.
select set_config('test.uid', '3b000000-0000-4000-8000-000000000002', false);
do $$
declare n int;
begin
  select count(*) into n from public.my_notifications where not is_read;
  assert n > 0, 'advertiser A''s mark-all read advertiser B''s notifications too';
  perform public.ok('mark all read stops at your own notifications');
end $$;

-- =========================================================================
-- 11. Preferences are your own
-- =========================================================================
do $$
begin
  update public.notification_preferences
     set email_advertisement_updates = false
   where user_id = '3a000000-0000-4000-8000-000000000001';
  if found then
    raise exception 'FAIL: advertiser B changed advertiser A''s notification preferences';
  end if;
  perform public.ok('an advertiser cannot change another''s notification preferences');

  insert into public.notification_preferences (user_id, email_advertisement_updates)
  values ('3b000000-0000-4000-8000-000000000002', false);
  assert (select email_advertisement_updates
            from public.notification_preferences
           where user_id = '3b000000-0000-4000-8000-000000000002') = false;
  perform public.ok('an advertiser sets their own preferences');
end $$;

do $$
begin
  begin
    insert into public.notification_preferences (user_id, email_advertisement_updates)
    values ('3a000000-0000-4000-8000-000000000001', false);
    raise exception 'FAIL: advertiser B created preferences for advertiser A';
  exception when insufficient_privilege or unique_violation then
    perform public.ok('an advertiser cannot create preferences on somebody else''s behalf');
  end;
end $$;

-- =========================================================================
-- 12. A notification cannot send anybody off this site
-- =========================================================================
reset role;
select set_config('test.uid', '', false);
do $$
begin
  begin
    insert into public.notifications (user_id, type, title, body, href, dedupe_key)
    values ('3a000000-0000-4000-8000-000000000001', 'advertisement_approved',
            'Elsewhere', 'Somewhere else entirely.', 'https://example.com/phish', 'phish');
    raise exception 'FAIL: a notification linked off the site';
  exception when check_violation then
    perform public.ok('a notification can only point at a path on this site');
  end;
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.notification_deliveries where channel = 'in_app';
  assert n = 0, format('%s in-app rows found in the outbox', n);
  perform public.ok('the outbox holds no in-app rows at all');
end $$;

reset role;
do $$
declare n int;
begin
  select t.n into n from public.test_assertions t;
  raise notice '% assertions passed.', n;
end $$;

\echo ''
