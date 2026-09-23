import 'server-only';

import { createHash } from 'node:crypto';

import { headers } from 'next/headers';

import { getCurrentUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Rate limiting, keyed on a hash rather than on an address.
 *
 * The counter itself lives in Postgres — see migration 0016 for why an
 * in-memory one is close to useless on a serverless host. This module decides
 * WHO is being counted and turns that into an opaque key.
 *
 * Nothing identifying reaches the database. The caller's address is hashed
 * with `RATE_LIMIT_SALT` (or, failing that, the cron secret, which is already
 * required and already secret) before the key is built, so `rate_limits` holds
 * strings that cannot be reversed into "who tried to sign in on Tuesday".
 *
 * Every limit below is deliberately generous. These exist to stop a script,
 * not to meter an API, and the failure that matters is not "an attacker got
 * through" but "a person in an internet café could not sign in because
 * somebody else on the same address already had". The limits are set where a
 * human being will never reach them.
 */

export interface RateLimit {
  /** Requests allowed inside the window. */
  limit: number;
  /** The window, in seconds. */
  windowSeconds: number;
}

/**
 * The limits, in one place, with what each is protecting against.
 *
 * Signing in is the tightest because it is the one a password-guessing script
 * actually targets. Posting an advertisement is loose because a person
 * correcting a rejected advertisement may genuinely submit several times in an
 * afternoon, and refusing them is a support call.
 */
export const LIMITS = {
  /** Password guessing. Ten a minute is far more than anybody types. */
  signIn: { limit: 10, windowSeconds: 60 },
  /** Account creation, which costs us an email and a row. */
  signUp: { limit: 5, windowSeconds: 600 },
  /** Password-reset mail: the one endpoint that sends mail to an address
   *  somebody else chose, so it is the one worth being strict about. */
  passwordReset: { limit: 4, windowSeconds: 900 },
  /** Advertisement submission. Loose on purpose; see above. */
  postAdvertisement: { limit: 20, windowSeconds: 3600 },
  /** Opening a checkout. An order costs a call to Razorpay. */
  paymentOrder: { limit: 15, windowSeconds: 600 },
  /** Reporting an advertisement — abuse here is one person flooding the queue. */
  reportAdvertisement: { limit: 10, windowSeconds: 3600 },
  /** Search recording. Generous: it fires once per search a person makes. */
  recordSearch: { limit: 120, windowSeconds: 600 },
} as const satisfies Record<string, RateLimit>;

export type LimitName = keyof typeof LIMITS;

/**
 * The caller, as an opaque string.
 *
 * A signed-in person is counted by their account, which is both fairer and
 * more accurate than an address: they keep their own allowance as they move
 * between a phone and an office connection, and sharing an address with a
 * neighbour costs them nothing.
 *
 * Everyone else is counted by a hash of their address. `x-forwarded-for` is
 * set by the proxy in front of the application; its FIRST entry is the client
 * as that proxy saw it. Later entries are appendable by the client and are
 * ignored.
 */
async function callerKey(): Promise<string> {
  const user = await getCurrentUser().catch(() => null);
  if (user) return `u:${user.id}`;

  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for') ?? '';
  const address =
    forwarded.split(',')[0]?.trim() ||
    headerList.get('x-real-ip')?.trim() ||
    '';

  if (!address) return '';

  const salt = process.env.RATE_LIMIT_SALT || process.env.CRON_SECRET || '';
  return `a:${createHash('sha256').update(`${salt}:${address}`).digest('hex').slice(0, 32)}`;
}

export interface RateLimitResult {
  allowed: boolean;
  /** A sentence to show somebody who has been turned away. */
  message: string;
}

const REFUSAL =
  'Too many attempts from this connection. Please wait a minute and try again.';

/**
 * Consumes one unit against a named limit.
 *
 * Fails OPEN. If the database is unreachable, or the caller cannot be
 * identified at all, the request is allowed: a limiter that turns into an
 * outage when the counter breaks has done more damage than the abuse it was
 * guarding against. The one thing it must never do is silently stop working
 * while appearing to work, which is why the failure is logged.
 */
export async function checkRateLimit(
  name: LimitName,
  /** Distinguishes two limits of the same kind — e.g. per advertisement. */
  scope?: string,
): Promise<RateLimitResult> {
  if (!isSupabaseConfigured) return { allowed: true, message: '' };

  const { limit, windowSeconds } = LIMITS[name];

  try {
    const key = await callerKey();
    if (!key) return { allowed: true, message: '' };

    const bucket = scope ? `${name}:${scope}:${key}` : `${name}:${key}`;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error('rate limit check failed', { name, reason: error.message });
      return { allowed: true, message: '' };
    }

    return data === false ? { allowed: false, message: REFUSAL } : { allowed: true, message: '' };
  } catch (error) {
    console.error('rate limit check threw', {
      name,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return { allowed: true, message: '' };
  }
}
