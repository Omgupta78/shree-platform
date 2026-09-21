-- =============================================================================
-- DEVELOPMENT RATES — NOT A MIGRATION. NEVER RUN THIS ON PRODUCTION.
--
-- Every package ships with `price_paise` NULL, and that is deliberate: Shree
-- Advertising quote their rates from the office and have not given them to me.
-- A number invented here and shipped would be a figure in front of a customer
-- that nobody at the business agreed to. `src/config/packages.ts` says the same
-- thing at more length, and migration 0013 repeats it.
--
-- But an integration that has never taken a rupee has not been tested. This
-- file exists so a developer can put figures in, run a Razorpay test-mode
-- payment end to end, and see the checkout, the verification, the receipt and
-- the admin ledger work. The figures below are placeholders chosen to be
-- obviously placeholders.
--
-- Run it against a local or staging database only:
--
--     psql -d shree_dev -f supabase/seed/dev_package_prices.sql
--
-- To take pricing back down — which is what production looks like until the
-- office supplies rates — run the last statement on its own.
--
-- When real rates arrive they are entered at /admin/packages, by an
-- administrator, against the live database. Not here.
-- =============================================================================

update public.packages set price_paise =  19900, duration_days = 30 where id = 'basic';
update public.packages set price_paise =  49900, duration_days = 45 where id = 'standard';
update public.packages set price_paise =  99900, duration_days = 60 where id = 'premium';

-- Unpricing, for putting a database back the way it ships:
--   update public.packages set price_paise = null;
