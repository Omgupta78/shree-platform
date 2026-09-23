-- ============================================================
-- Bundle 4 of 5 — add the 'cancelled' payment status (must run ALONE)
--
-- Paste this WHOLE file into the Supabase SQL editor and press Run.
-- Run the bundles in order. Wait for each to finish before the next.
-- Built from: 0012_payment_status_cancelled.sql
-- Generated from supabase/migrations/ — do not edit by hand.
-- ============================================================

-- ----- begin 0012_payment_status_cancelled.sql -----
-- =============================================================================
-- Shree Classified — Phase 9: a fourth answer to a payment attempt
--
-- This migration contains ONE statement, for the reason written out in full in
-- 0008: `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that
-- adds it, and the Supabase SQL editor runs a script as one transaction. 0013
-- refers to `cancelled` in a function body and a partial index, so it may only
-- be run after this one has finished.
--
-- What it adds: `cancelled`. Until now a payment that did not succeed could
-- only be `failed`, and most payments that do not succeed are neither failed
-- nor pending — the advertiser opened the checkout, looked at the amount and
-- closed it. Razorpay tells us which of the two happened, and recording a
-- dismissed checkout as a failure would put a failure reason in front of the
-- office for something nobody got wrong.
-- =============================================================================

alter type public.payment_status add value if not exists 'cancelled' after 'failed';

-- ----- end 0012_payment_status_cancelled.sql -----

