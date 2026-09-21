/**
 * Lifecycle configuration.
 *
 * The authoritative values live in the `app_settings` table, because the
 * database enforces them too — `request_renewal()` decides whether a live
 * advertisement is "due" using the same number the dashboard shows. These
 * constants are only the fallbacks used before the database is connected or
 * if a row is missing, and they are the only place in the application code
 * where either number is written down.
 */
export const DEFAULT_EXPIRING_SOON_DAYS = 7;
export const DEFAULT_RUN_DAYS = 30;
export const DEFAULT_MAX_EXTENSION_DAYS = 365;

/** Every date a person reads is an Indian calendar date. */
export const DISPLAY_TIME_ZONE = 'Asia/Kolkata';
