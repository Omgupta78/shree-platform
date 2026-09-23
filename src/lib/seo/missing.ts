import type { SupabaseClient } from '@supabase/supabase-js';

import { CATEGORY_BY_SLUG } from '@/config/categories';
import { LOCATION_BY_SLUG } from '@/config/locations';
import type { Database } from '@/types/database';

/**
 * Deciding, before anything renders, whether a classifieds URL exists.
 *
 * This lives in the proxy rather than in the page, and that is forced rather
 * than chosen. Next.js 16.3.5 begins streaming the response as soon as the
 * shell renders — and this site's shell reads the session to draw the account
 * menu, so it is dynamic on every request. By the time a page discovers its
 * advertisement is missing, the `200` has already been sent and the status
 * cannot be changed. `notFound()` still renders the right page and still
 * injects `noindex`, but the response says 200: a soft 404. Next's own
 * documentation names the remedy — "to return a real 404 status, the resource
 * has to be checked before the response streams... run that check in proxy
 * instead" — and this is that check.
 *
 * It is kept deliberately cheap:
 *
 *   - Only GET requests for a path under `/classifieds`.
 *   - A two-segment path (`/classifieds/jobs/roorkee`) is settled from
 *     configuration alone. Both halves are known lists, so a bad one is a 404
 *     with no query at all.
 *   - A one-segment path that is a known category is a section, and returns
 *     immediately.
 *   - Only then, for an advertisement slug, is there a query — one indexed
 *     lookup selecting a single column.
 *
 * An advertisement that is merely finished is NOT missing. It keeps its URL
 * and answers 200 with "Advertisement expired" and `noindex`, because the
 * address has been shared, printed and sent over WhatsApp, and a 404 for it
 * would be less true than the page that says what happened.
 */

export type MissingVerdict = 'ok' | 'missing';

export async function classifiedsPathVerdict(
  pathname: string,
  /**
   * Null when the site is running without a database, where the offline
   * dataset answers instead. The parts of this decision that come from
   * configuration still hold; an advertisement slug cannot be checked, and is
   * allowed through rather than guessed at.
   */
  supabase: SupabaseClient<Database> | null,
): Promise<MissingVerdict> {
  const segments = pathname.split('/').filter(Boolean);
  // ['classifieds'] — the section index.
  if (segments.length < 2 || segments[0] !== 'classifieds') return 'ok';

  const first = segments[1] as string;

  if (segments.length === 2) {
    // A category is a section and always exists.
    if (CATEGORY_BY_SLUG.has(first)) return 'ok';
    if (!supabase) return 'ok';
    return advertisementVerdict(first, supabase);
  }

  if (segments.length === 3) {
    const second = segments[2] as string;
    /*
     * Next.js serves the split advertisement sitemaps from
     * `/classifieds/sitemap/0.xml`. It is a real route and must not be
     * mistaken for a category-and-place pair.
     */
    if (first === 'sitemap') return 'ok';
    // Both halves come from fixed lists, so this needs no database at all.
    return CATEGORY_BY_SLUG.has(first) && LOCATION_BY_SLUG.has(second) ? 'ok' : 'missing';
  }

  // Deeper than the site goes.
  return 'missing';
}

/**
 * Is there an advertisement at this slug — live, or finished and remembered?
 *
 * On any database error the answer is 'ok'. A failed lookup must not turn a
 * real advertisement into a 404: the page itself will handle an empty result,
 * and a wrong 404 is far more expensive than a wrong 200, because Google
 * removes the URL over it.
 */
async function advertisementVerdict(
  slug: string,
  supabase: SupabaseClient<Database>,
): Promise<MissingVerdict> {
  const live = await supabase.from('public_ads').select('slug').eq('slug', slug).maybeSingle();
  if (live.error) return 'ok';
  if (live.data) return 'ok';

  // Not live. It may still be one whose run has ended, which keeps its URL.
  const expired = await supabase.rpc('expired_ad_stub', { p_slug: slug });
  if (expired.error) return 'ok';
  const rows = expired.data as unknown;
  const found = Array.isArray(rows) ? rows.length > 0 : rows !== null && rows !== undefined;
  return found ? 'ok' : 'missing';
}
