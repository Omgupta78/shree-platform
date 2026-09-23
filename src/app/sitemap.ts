import type { MetadataRoute } from 'next';

import { CATEGORIES } from '@/config/categories';
import { liveLocationLandings } from '@/lib/seo/landings';
import { siteUrl } from '@/lib/env';

/**
 * The main sitemap: the pages that do not change one at a time.
 *
 * Advertisements are NOT here. There may be tens of thousands of them and they
 * turn over constantly, so they are split across
 * `/classifieds/sitemap/0.xml`, `/1.xml` and so on, listed in `robots.txt`
 * alongside this file. See `lib/seo/sitemap.ts`.
 *
 * What is deliberately absent, and why:
 *
 *   /admin, /my-ads       private. Behind authentication, and listing an
 *                         address is not the same as protecting it — but
 *                         putting it in a sitemap is actively inviting a
 *                         crawler to a page it will only be refused from.
 *   /sign-in, /sign-up    nothing to rank; a search result for a login form
 *                         helps nobody.
 *   /post-ad              a half-written form, already `noindex`.
 *   /search               a redirect, and an unbounded space of query strings.
 *   expired advertisements
 *                         they answer with "no longer active" and say
 *                         `noindex`; asking for them to be crawled would be
 *                         asking for a page we have told Google to drop.
 *   filtered and sorted views
 *                         every one canonicalises to its clean section.
 *
 * Location landing pages appear only when they have genuine inventory behind
 * them. A pair that is currently empty is not listed here at all, so nothing
 * in this file leads to a thin page.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();
  const landings = await liveLocationLandings();

  return [
    { url: base, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/classifieds`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/categories`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/advertise`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/about`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },

    ...CATEGORIES.map((category) => ({
      url: `${base}/classifieds/${category.slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),

    ...landings.map((landing) => ({
      url: `${base}${landing.path}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      // Below the section it belongs to: a section is the better answer when
      // somebody has not said where.
      priority: 0.6,
    })),
  ];
}
