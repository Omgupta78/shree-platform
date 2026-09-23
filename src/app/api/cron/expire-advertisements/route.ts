import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * The expiry sweep, for any scheduler that can make an HTTP request.
 *
 * `expire_advertisements()` does the work and is idempotent, so a scheduler
 * that fires twice, or retries after a timeout, does no harm. The request must
 * carry `Authorization: Bearer <CRON_SECRET>` — the form Vercel Cron sends, and
 * trivial to reproduce from GitHub Actions, cron-job.org or a server's own
 * crontab. Without the secret configured the endpoint refuses everything
 * rather than running open.
 *
 * Public visibility does not wait for this: `public_ads` hides an
 * advertisement the moment its date passes. The sweep is the bookkeeping —
 * the status change and the "expired automatically" entry in the history.
 *
 * The search log is pruned in the same call. It is daily housekeeping of the
 * same kind, it wants no schedule of its own, and a retention period that is
 * only enforced when somebody remembers to run it is not a retention period.
 * `analytics.search_retention_days` in `app_settings` decides how long is
 * kept; the default is ninety days. A failure to prune does not fail the
 * sweep — expiry is what advertisers are waiting on.
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

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('expire_advertisements');
  if (error) {
    // The detail stays in the server log; the caller learns only that it failed.
    console.error('expire_advertisements failed', error.message);
    return NextResponse.json({ ok: false, error: 'sweep failed' }, { status: 500 });
  }
  const { data: pruned, error: pruneError } = await supabase.rpc('prune_search_events');
  if (pruneError) console.error('prune_search_events failed', pruneError.message);

  return NextResponse.json({
    ok: true,
    expired: Number(data ?? 0),
    searchEventsPruned: pruneError ? null : Number(pruned ?? 0),
    ranAt: new Date().toISOString(),
  });
}

export const GET = run;
export const POST = run;
