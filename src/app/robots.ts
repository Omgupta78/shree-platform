import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/env';
import { advertisementSitemapCount } from '@/lib/seo/sitemap';

/**
 * What crawlers may fetch, and where the sitemaps are.
 *
 * Two things this file is not.
 *
 * It is not security. Everything under `/admin` and `/my-ads` is protected by
 * the proxy, by each page's own check and by row-level security; a crawler
 * that ignores this file still gets nothing. The `Disallow` lines are here to
 * stop crawl budget being spent on pages that will only ever answer with a
 * sign-in redirect.
 *
 * And it is not how a page is kept out of an index. A disallowed URL can still
 * be indexed — from a link elsewhere — precisely because the crawler was not
 * allowed to fetch it and read the `noindex`. So the private pages carry
 * `noindex` in their own metadata as well, and that is the mechanism that
 * actually removes them.
 *
 * The previous version disallowed `/account/`, which is not a path this site
 * has; the advertiser's dashboard is `/my-ads`. It also left `/auth/` and the
 * sign-in pages open. Both corrected here.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = siteUrl();
  const sitemapCount = await advertisementSitemapCount();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        /*
         * Only two kinds of path are blocked, and the shortness of this list
         * is the point.
         *
         * The first is anything a crawler would be redirected away from
         * anyway: the office, the advertiser's dashboard, the dashboard
         * aliases. A crawler asking for those gets a redirect to a sign-in
         * form, so the fetch buys nobody anything.
         *
         * The second is machinery and unbounded spaces: webhooks and cron
         * endpoints, the auth callback, and `/search`, which is a redirect
         * over an unlimited set of query strings.
         *
         * Everything else is deliberately left crawlable, INCLUDING the
         * sign-in forms, the post-advertisement form, expired advertisements
         * and every filtered or sorted view. Each of those says `noindex` in
         * its own metadata, and a crawler has to be allowed to fetch a page
         * in order to read that. Blocking them in this file would leave the
         * URLs eligible to be indexed from a link somewhere else, with no way
         * for Google to discover we did not want them — which is the exact
         * trap described above, and one it would be odd to describe and then
         * fall into.
         */
        disallow: ['/admin/', '/my-ads/', '/dashboard/', '/api/', '/auth/', '/search'],
      },
    ],
    sitemap: [
      `${base}/sitemap.xml`,
      ...Array.from(
        { length: sitemapCount },
        (_, id) => `${base}/classifieds/sitemap/${id}.xml`,
      ),
    ],
    host: base,
  };
}
