import 'server-only';

/**
 * Structured server-side logging, and a short list of things never to log.
 *
 * One shape for every entry, so a hosting provider's log search can filter on
 * a field rather than on a substring of English prose. `console` is the
 * transport because that is what Vercel, Fly, a container and a plain Node
 * process all collect without any additional service — this project does not
 * add a paid dependency to write a line of JSON.
 *
 * WHAT NEVER GOES IN, in any field:
 *
 *   passwords, in any form
 *   access tokens, refresh tokens, session cookies
 *   the Razorpay key secret or webhook secret, or any signature
 *   the Supabase service-role key
 *   card numbers or anything from a payment instrument
 *   an advertiser's telephone number, email or address
 *
 * The rule of thumb is that a log is read by more people, in more places, and
 * for longer than the request that produced it. If a field would be awkward in
 * a screenshot pasted into a support thread, it does not belong here.
 *
 * Identifiers ARE logged: an advertisement id, a payment id, a user id. They
 * are meaningless without the database, and without them an entry cannot be
 * traced to the thing it describes, which makes the log ornamental.
 */

export type LogLevel = 'info' | 'warn' | 'error';

/** Only these shapes, so nothing accidentally stringifies an object of PII. */
export type LogValue = string | number | boolean | null | undefined;

export interface LogFields {
  [key: string]: LogValue;
}

/**
 * Field names that must never carry a value, whatever the caller intended.
 *
 * A belt-and-braces measure rather than the main control: the main control is
 * that callers pass identifiers and reasons. This catches the refactor in
 * eighteen months that adds `token` to a context object three layers up.
 */
const FORBIDDEN = new Set([
  'password',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'keySecret',
  'webhookSecret',
  'signature',
  'authorization',
  'cookie',
  'serviceRoleKey',
  'card',
  'cvv',
  'phone',
  'email',
  'contactPhone',
  'contactEmail',
]);

function scrub(fields: LogFields): LogFields {
  const safe: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    safe[key] = FORBIDDEN.has(key) ? '[redacted]' : value;
  }
  return safe;
}

function write(level: LogLevel, event: string, fields: LogFields): void {
  const entry = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...scrub(fields),
  });

  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

/**
 * Something worth noticing happened, and it was not an error.
 *
 * Payments settled, webhooks handled, scheduled jobs run.
 */
export function logEvent(event: string, fields: LogFields = {}): void {
  write('info', event, fields);
}

/**
 * Something went wrong that somebody should look at.
 *
 * `reason` should be the provider's or the database's message. That is safe:
 * it is a description of a failure, not a credential. What must not be passed
 * is the request that caused it.
 */
export function logFailure(event: string, fields: LogFields = {}): void {
  write('error', event, fields);
}

/**
 * A security-relevant event: a refused sign-in, a rejected signature, an
 * attempt to reach somebody else's advertisement.
 *
 * Logged at warn, because individually these are ordinary — people mistype
 * passwords — and it is the RATE that means something. Separating them from
 * ordinary failures is what makes that rate countable.
 */
export function logSecurityEvent(event: string, fields: LogFields = {}): void {
  write('warn', event, fields);
}
