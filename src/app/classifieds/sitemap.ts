import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/env';
import { advertisementSitemapCount, advertisementSitemapPage } from '@/lib/seo/sitemap';

/**
 * The advertisements, split across as many files as they need.
 *
 * Next.js serves these at `/classifieds/sitemap/0.xml`, `/1.xml` and so on;
 * `robots.txt` lists every one of them so a crawler finds them all without a
 * separate index document.
 *
 * `getPublicAdvertisementPage` reads `public_ads`, which contains only
 * approved, unexpired rows — so a pending, rejected, withdrawn or finished
 * advertisement cannot appear here however this function is called.
 */
export async function generateSitemaps() {
  const count = await advertisementSitemapCount();
  return Array.from({ length: count }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  // Next.js 16 passes the id as a promise, where 15 passed the value.
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const page = Number(await id) || 0;
  const base = siteUrl();
  const entries = await advertisementSitemapPage(page);

  return entries.map((entry) => ({
    url: `${base}/classifieds/${entry.slug}`,
    // The advertisement's own last change, not the moment this file was
    // built. A sitemap that stamps everything with today teaches crawlers to
    // ignore its dates.
    ...(entry.updatedAt ? { lastModified: new Date(entry.updatedAt) } : {}),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));
}
