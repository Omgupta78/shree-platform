-- =============================================================================
-- LOCAL VALIDATION ONLY — not applied to Supabase.
--
-- Phase 9. Taking the money: what a payment costs, who may say it is paid, and
-- what happens when the same good news arrives twice.
--
-- The security review Phase 9 asks for is written here rather than performed
-- once by hand, because a payment integration is not reviewed once. Each
-- numbered attack below is a question somebody will ask this schema again
-- after the next change to it.
--
-- User ids are this file's own — the 2a/2b/2c/2d series. Advertiser A,
-- advertiser B, a moderator and an administrator.
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

delete from public.test_assertions;
insert into public.test_assertions values (0);

delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data) values
  ('2a000000-0000-4000-8000-000000000001', 'payera@example.com', '{"full_name":"Advertiser A"}'),
  ('2b000000-0000-4000-8000-000000000002', 'payerb@example.com', '{"full_name":"Advertiser B"}'),
  ('2c000000-0000-4000-8000-000000000003', 'paymod@example.com', '{"full_name":"Payments Moderator"}'),
  ('2d000000-0000-4000-8000-000000000004', 'payadm@example.com', '{"full_name":"Payments Admin"}');

update public.profiles set role = 'moderator' where id = '2c000000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin'     where id = '2d000000-0000-4000-8000-000000000004';

-- Real rates, for this file only. The packages ship unpriced; see
-- supabase/seed/dev_package_prices.sql for why.
update public.packages set price_paise = 19900, duration_days = 30 where id = 'basic';
update public.packages set price_paise = 49900, duration_days = 45 where id = 'standard';

-- One advertisement each, entered by a trusted connection.
do $$
declare
  cat uuid := (select id from public.categories where slug = 'property');
  loc uuid := (select id from public.locations  where slug = 'roorkee');
begin
  insert into public.ads (user_id, category_id, location_id, title, description, price, price_type,
                          contact_name, contact_phone, status, package_id)
  values
    ('2a000000-0000-4000-8000-000000000001', cat, loc, 'Payments A flat',
     'A flat used only by the payment checks. Not a real advertisement.',
     8000, 'fixed', 'Advertiser A', '9000000021', 'pending', 'standard'),
    ('2b000000-0000-4000-8000-000000000002', cat, loc, 'Payments B plot',
     'A plot used only by the payment checks. Not a real advertisement.',
     500000, 'fixed', 'Advertiser B', '9000000022', 'pending', 'basic');
end $$;

-- =========================================================================
-- 1. The price is the database's answer, not the request's
-- =========================================================================
set role authenticated;
select set_config('test.uid', '2a000000-0000-4000-8000-000000000001', false);

do $$
declare
  ad  uuid := public.test_ad_id('Payments A flat');
  pay uuid;
  r   record;
begin
  -- The browser names a package and an amount of one paisa. Only the package
  -- survives the trip.
  insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
  values (ad, '2a000000-0000-4000-8000-000000000001', 'basic', 1, 'razorpay', 'order_A1')
  returning id into pay;

  select amount_paise, package_id, package_name, package_duration_days, status, currency
    into r from public.payments where id = pay;

  assert r.amount_paise = 49900,
    format('the payment was raised at %s paise, expected the package''s 49900', r.amount_paise);
  perform public.ok('a payment costs what the package costs, not what the request said');

  assert r.package_id = 'standard',
    format('the payment was filed against package %s, expected the advertisement''s standard', r.package_id);
  perform public.ok('a payment names the advertisement''s package, not the one the request named');

  assert r.package_name = 'Standard' and r.package_duration_days = 45,
    'the payment did not snapshot the package name and run length';
  perform public.ok('a payment records the package as it stood when it was raised');

  assert r.status = 'created' and r.currency = 'INR';
  perform public.ok('a payment starts as created, in rupees');
end $$;

-- =========================================================================
-- 2. A payment belongs to one advertiser, and one advertisement
-- =========================================================================
select set_config('test.uid', '2b000000-0000-4000-8000-000000000002', false);

do $$
declare
  a_ad uuid := public.test_ad_id('Payments A flat');
  n    int;
begin
  begin
    insert into public.payments (ad_id, user_id, package_id, amount_paise)
    values (a_ad, '2b000000-0000-4000-8000-000000000002', 'basic', 1);
    raise exception 'FAIL: advertiser B raised a payment against advertiser A''s advertisement';
  exception when insufficient_privilege then
    perform public.ok('a payment can only be raised against your own advertisement');
  end;

  select count(*) into n from public.my_payments;
  assert n = 0, format('advertiser B saw %s of advertiser A''s payments', n);
  perform public.ok('an advertiser''s receipts are invisible to another advertiser');

  select count(*) into n from public.admin_payments;
  assert n = 0, format('an ordinary advertiser read %s rows of the office ledger', n);
  perform public.ok('the office ledger returns nothing to an ordinary advertiser');
end $$;

-- =========================================================================
-- 3. An advertiser cannot re-price, reassign or settle their own payment
-- =========================================================================
select set_config('test.uid', '2a000000-0000-4000-8000-000000000001', false);

do $$
declare
  pay uuid := (select id from public.payments where provider_order_id = 'order_A1');
  b_ad uuid := public.test_ad_id('Payments B plot');
begin
  begin
    update public.payments set amount_paise = 1 where id = pay;
    raise exception 'FAIL: an advertiser re-priced their own payment';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot re-price a payment');
  end;

  begin
    update public.payments set status = 'paid', paid_at = now() where id = pay;
    raise exception 'FAIL: an advertiser marked their own payment paid';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot mark their own payment paid');
  end;

  begin
    update public.payments set ad_id = b_ad where id = pay;
    raise exception 'FAIL: an advertiser moved a payment onto another advertisement';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot reassign a payment to another advertisement');
  end;

  begin
    perform public.settle_payment('razorpay', 'order_A1', 'pay_forged', 'forged_signature', 49900);
    raise exception 'FAIL: an advertiser called the settlement function';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot call the settlement function');
  end;

  begin
    perform public.close_payment('razorpay', 'order_A1', 'failed', 'nonsense');
    raise exception 'FAIL: an advertiser closed their own payment';
  exception when insufficient_privilege then
    perform public.ok('an advertiser cannot close a payment');
  end;
end $$;

-- =========================================================================
-- 4. One open attempt per advertisement
-- =========================================================================
do $$
declare
  ad uuid := public.test_ad_id('Payments A flat');
begin
  begin
    insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
    values (ad, '2a000000-0000-4000-8000-000000000001', 'standard', 1, 'razorpay', 'order_A1_again');
    raise exception 'FAIL: a second open payment was raised against one advertisement';
  exception when unique_violation then
    perform public.ok('an advertisement carries at most one open payment attempt');
  end;
end $$;

-- =========================================================================
-- 5. Settlement: verified, idempotent, and its own amount
-- =========================================================================
reset role;
select set_config('test.uid', '', false);

do $$
declare
  r record;
begin
  begin
    perform public.settle_payment('razorpay', 'order_A1', 'pay_A1', 'sig_A1', 100);
    raise exception 'FAIL: a payment settled an amount other than the one raised';
  exception when check_violation then
    perform public.ok('a settlement whose amount is not the amount raised is refused');
  end;

  begin
    perform public.settle_payment('razorpay', 'order_does_not_exist', 'pay_x', 'sig_x', 49900);
    raise exception 'FAIL: a payment settled against an order nobody raised';
  exception when no_data_found then
    perform public.ok('a settlement against an unknown order is refused');
  end;

  assert public.settle_payment('razorpay', 'order_A1', 'pay_A1', 'sig_A1', 49900) = 'paid';
  select status, provider_payment_id, paid_at into r from public.payments where provider_order_id = 'order_A1';
  assert r.status = 'paid' and r.provider_payment_id = 'pay_A1' and r.paid_at is not null;
  perform public.ok('a verified payment settles, and records when and by which provider payment');

  -- The refresh, the second tab, and the webhook arriving after the browser
  -- callback all land here.
  assert public.settle_payment('razorpay', 'order_A1', 'pay_A1', 'sig_A1', 49900) = 'paid';
  assert (select paid_at from public.payments where provider_order_id = 'order_A1') = r.paid_at,
    'settling twice moved the settlement time';
  assert (select count(*) from public.payments where provider_order_id = 'order_A1') = 1;
  perform public.ok('settling an already-settled payment is not an error and changes nothing');

  begin
    perform public.settle_payment('razorpay', 'order_A1', 'pay_A1_different', 'sig', 49900);
    raise exception 'FAIL: one order was settled twice by two different payments';
  exception when unique_violation then
    perform public.ok('a second, different payment against a settled order is refused, not swallowed');
  end;
end $$;

-- =========================================================================
-- 6. Paid is terminal but for a refund
-- =========================================================================
do $$
begin
  -- A `payment.failed` webhook arriving late for an attempt that was captured.
  assert public.close_payment('razorpay', 'order_A1', 'failed', 'Late failure notice.') = 'paid';
  assert (select status from public.payments where provider_order_id = 'order_A1') = 'paid';
  perform public.ok('a late failure notice does not un-pay a settled payment');

  assert public.close_payment('razorpay', 'order_A1', 'cancelled') = 'paid';
  perform public.ok('a dismissed checkout does not un-pay a settled payment');

  begin
    update public.payments set status = 'created' where provider_order_id = 'order_A1';
    raise exception 'FAIL: a settled payment was returned to created';
  exception when check_violation then
    perform public.ok('a payment cannot be returned to created');
  end;

  assert public.is_permitted_payment_transition('paid', 'refunded');
  assert not public.is_permitted_payment_transition('paid', 'failed');
  assert not public.is_permitted_payment_transition('refunded', 'paid');
  assert public.is_permitted_payment_transition('failed', 'paid');
  perform public.ok('the transition table refuses un-paying and permits a late capture');
end $$;

-- =========================================================================
-- 7. A retry is a new attempt, and it can still succeed
-- =========================================================================
do $$
declare
  ad  uuid := public.test_ad_id('Payments B plot');
  pay uuid;
begin
  insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
  values (ad, '2b000000-0000-4000-8000-000000000002', 'basic', 1, 'razorpay', 'order_B1')
  returning id into pay;

  assert public.close_payment('razorpay', 'order_B1', 'cancelled') = 'cancelled';
  assert (select failure_reason from public.payments where id = pay) is null;
  perform public.ok('a dismissed checkout is cancelled, and carries no failure reason');

  -- Razorpay captured it after the advertiser closed the window.
  assert public.settle_payment('razorpay', 'order_B1', 'pay_B1', 'sig_B1', 19900) = 'paid';
  perform public.ok('a payment captured after the checkout closed still settles');

  -- A cancelled attempt is finished, so a fresh order may be raised.
  insert into public.payments (ad_id, user_id, package_id, amount_paise, provider, provider_order_id)
  values (ad, '2b000000-0000-4000-8000-000000000002', 'basic', 1, 'razorpay', 'order_B2');
  assert public.close_payment('razorpay', 'order_B2', 'failed') = 'failed';
  assert (select failure_reason from public.payments where provider_order_id = 'order_B2') is not null;
  perform public.ok('a failed attempt always carries a reason, supplied or not');
end $$;

-- =========================================================================
-- 8. Re-pricing a package does not rewrite what was already paid
-- =========================================================================
do $$
declare
  r record;
begin
  update public.packages set price_paise = 99900, name = 'Standard Plus' where id = 'standard';

  select amount_paise, package_name into r from public.payments where provider_order_id = 'order_A1';
  assert r.amount_paise = 49900 and r.package_name = 'Standard',
    format('an old receipt now reads %s paise for %s', r.amount_paise, r.package_name);
  perform public.ok('re-pricing or renaming a package does not rewrite an old receipt');

  update public.packages set price_paise = 49900, name = 'Standard' where id = 'standard';
end $$;

-- =========================================================================
-- 9. The webhook log is the service role's alone
-- =========================================================================
set role authenticated;
select set_config('test.uid', '2a000000-0000-4000-8000-000000000001', false);

do $$
begin
  begin
    perform 1 from public.payment_webhook_events;
    raise exception 'FAIL: an advertiser read the webhook log';
  exception when insufficient_privilege then
    perform public.ok('the webhook log is unreadable by a signed-in advertiser');
  end;
end $$;

-- =========================================================================
-- 10. Prices are an administrator's business
-- =========================================================================
do $$
begin
  update public.packages set price_paise = 1 where id = 'standard';
  if found then
    raise exception 'FAIL: an advertiser re-priced a package';
  end if;
  perform public.ok('an advertiser cannot re-price a package');
end $$;

select set_config('test.uid', '2c000000-0000-4000-8000-000000000003', false);
do $$
declare n int;
begin
  update public.packages set price_paise = 1 where id = 'standard';
  if found then
    raise exception 'FAIL: a moderator re-priced a package';
  end if;
  perform public.ok('a moderator cannot re-price a package');

  select count(*) into n from public.admin_payments;
  assert n >= 1, 'a moderator could not read the office ledger';
  perform public.ok('a moderator reads the office ledger');
end $$;

select set_config('test.uid', '2d000000-0000-4000-8000-000000000004', false);
do $$
begin
  update public.packages set price_paise = 59900 where id = 'standard';
  assert (select price_paise from public.packages where id = 'standard') = 59900,
    'an administrator could not re-price a package';
  perform public.ok('an administrator sets the rates');
  update public.packages set price_paise = 49900 where id = 'standard';
end $$;

-- =========================================================================
-- 11. A renewal is priced from the renewal, and approved once it is paid
-- =========================================================================
-- Publish it, then finish it, so it is due for renewal.
set role authenticated;
select set_config('test.uid', '2d000000-0000-4000-8000-000000000004', false);
select public.moderate_advertisement(public.test_ad_id('Payments A flat'), 'approve');

reset role;
select set_config('test.uid', '', false);
update public.ads set expires_at = now() - interval '1 minute'
 where id = public.test_ad_id('Payments A flat');

-- Renewed onto the cheaper package. The price must follow the renewal, not
-- the advertisement's own package.
set role authenticated;
select set_config('test.uid', '2a000000-0000-4000-8000-000000000001', false);
select public.request_renewal(public.test_ad_id('Payments A flat'), 'basic');

reset role;
select set_config('test.uid', '', false);
do $$
declare
  ad  uuid := public.test_ad_id('Payments A flat');
  rid uuid := (select id from public.ad_renewals where ad_id = ad and status = 'pending');
  n   int;
begin
  insert into public.payments (ad_id, user_id, package_id, amount_paise, purpose, renewal_id,
                               provider, provider_order_id)
  values (ad, '2a000000-0000-4000-8000-000000000001', 'standard', 1,
          'renewal', rid, 'razorpay', 'order_A_renewal');

  select amount_paise into n from public.payments where provider_order_id = 'order_A_renewal';
  assert n = 19900,
    format('the renewal was priced at %s paise, expected the renewal package''s 19900', n);
  perform public.ok('a renewal is priced from the package the renewal names');
end $$;

set role authenticated;
select set_config('test.uid', '2c000000-0000-4000-8000-000000000003', false);
do $$
declare
  ad uuid := public.test_ad_id('Payments A flat');
begin
  begin
    perform public.moderate_advertisement(ad, 'approve');
    raise exception 'FAIL: an unpaid renewal extended a run';
  exception when insufficient_privilege then
    perform public.ok('a renewal on a priced package cannot be approved until it is paid');
  end;
end $$;

reset role;
select set_config('test.uid', '', false);
do $$
begin
  assert public.settle_payment('razorpay', 'order_A_renewal', 'pay_A_renewal', 'sig', 19900) = 'paid';
  perform public.ok('the renewal payment settles');
end $$;

set role authenticated;
select set_config('test.uid', '2c000000-0000-4000-8000-000000000003', false);
do $$
declare
  ad uuid := public.test_ad_id('Payments A flat');
  r  record;
begin
  perform public.moderate_advertisement(ad, 'approve');
  select status, expires_at into r from public.ads where id = ad;
  assert r.status = 'approved' and r.expires_at > now();
  perform public.ok('once the renewal is paid, approving it starts the new run');
end $$;

-- =========================================================================
-- 12. An advertiser reads their own receipts, and what they bought
-- =========================================================================
select set_config('test.uid', '2a000000-0000-4000-8000-000000000001', false);
do $$
declare
  r record;
  n int;
begin
  select count(*) into n from public.my_payments;
  assert n = 2, format('advertiser A saw %s of their own payments, expected 2', n);
  perform public.ok('an advertiser sees their own payments and no others');

  select ad_reference, ad_title, status, amount_paise
    into r from public.my_payments where purpose = 'renewal';
  assert r.ad_reference is not null and r.ad_title = 'Payments A flat'
     and r.status = 'paid' and r.amount_paise = 19900;
  perform public.ok('a receipt names the advertisement it bought');

  begin
    perform provider_signature from public.my_payments;
    raise exception 'FAIL: the signature is in the advertiser''s view';
  exception when undefined_column then
    perform public.ok('the settlement signature is in no view anybody reads');
  end;
end $$;

reset role;
do $$
declare n int;
begin
  select t.n into n from public.test_assertions t;
  raise notice '% assertions passed.', n;
end $$;

\echo ''
