import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { isSupabaseConfigured } from '@/lib/env';
import { drainNotificationQueue, raiseExpiryReminders } from '@/lib/notifications/worker';

/**
 * The notification worker, for any scheduler that can make an HTTP request.
 *
 * Two jobs in one call, because they belong to the same minute of the day:
 * raise the reminders that are due, then send whatever is waiting — including
 * the ones just raised. Both are idempotent, so a scheduler that fires twice,
 * overlaps itself, or retries after a timeout does no harm: the reminder keys
 * on the advertisement's expiry date, and a claimed delivery is not handed to
 * a second worker.
 *
 * Authorised exactly like the expiry sweep: `Authorization: Bearer
 * <CRON_SECRET>`, the form Vercel Cron sends. Without the secret configured
 * the endpoint refuses everything rather than running open — an endpoint that
 * sends email to whoever asks is a spam relay with extra steps.
 */
export const dynamic = 'force-dynamic';

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  }
  if (!isSupabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 });
  }

  const limit = Number(new URL(request.url).searchParams.get('limit') ?? '25');
  const reminded = await raiseExpiryReminders();
  const sent = await drainNotificationQueue(Number.isFinite(limit) ? limit : 25);

  return NextResponse.json({
    ok: true,
    reminded,
    ...sent,
    ranAt: new Date().toISOString(),
  });
}

export const GET = run;
export const POST = run;
