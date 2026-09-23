import { NextResponse } from 'next/server';

import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseAnonClient } from '@/lib/supabase/public';

/**
 * Is the application up, and can it reach its database?
 *
 * Deliberately the smallest useful answer. A health check is an unauthenticated
 * endpoint that anybody can call as often as they like, so what it says has to
 * be safe to say to a stranger, repeatedly, forever.
 *
 * WHAT IT DOES NOT SAY: no version number, no commit, no environment name, no
 * hostname, no library versions, no configuration, no counts, no error text
 * from the database. Each of those is a small gift to somebody deciding
 * whether this site is worth attacking, and none of them helps a monitor
 * decide whether to page anybody.
 *
 * The database probe is a HEAD count against `categories` — a tiny public
 * reference table, readable by anonymous callers by design, with no personal
 * data in it. It proves the connection, the credentials and row-level security
 * are all working, and it costs an index lookup.
 *
 * Status codes, because that is what a monitor actually reads:
 *   200  everything answered
 *   503  configured for a database but it did not answer
 *
 * A site running deliberately without a database — as it does in development
 * and in the end-to-end suite — answers 200 with `database: "not configured"`,
 * because that is not a fault.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { status: 'ok', database: 'not configured' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const supabase = createSupabaseAnonClient();
    const { error } = await supabase
      .from('categories')
      .select('id', { count: 'exact', head: true });

    if (error) {
      // The reason goes to the server log, not to the caller.
      console.error(
        JSON.stringify({ level: 'error', event: 'health.database_unreachable' }),
      );
      return NextResponse.json(
        { status: 'degraded', database: 'unreachable' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { status: 'ok', database: 'ok' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { status: 'degraded', database: 'unreachable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
