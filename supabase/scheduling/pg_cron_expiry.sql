-- =============================================================================
-- OPTIONAL — the expiry sweep scheduled inside the database, with pg_cron.
--
-- Not a migration, and not applied automatically. Use this INSTEAD of (or as
-- well as — the sweep is idempotent) the /api/cron/expire-advertisements
-- endpoint, if the site is hosted somewhere without a scheduler.
--
-- Supabase: Database → Extensions → enable pg_cron, then run this in the SQL
-- editor. It runs every hour at five past; `expire_advertisements()` does
-- nothing when nothing is due, so running it often costs nothing.
-- =============================================================================

select cron.schedule(
  'shree-expire-advertisements',
  '5 * * * *',
  $$ select public.expire_advertisements(); $$
);

-- To remove it:
-- select cron.unschedule('shree-expire-advertisements');
