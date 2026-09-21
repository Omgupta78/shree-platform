import type { MetadataRoute } from 'next';

import { CATEGORIES } from '@/config/categories';
import { getPublicAdvertisementSlugs } from '@/lib/data/classifieds-repository';
import { siteUrl } from '@/lib/env';

/**
 * Static routes, every category, and every publicly visible advertisement.
 *
 * `getPublicAdvertisementSlugs` filters on status, so pending, rejected and
 * expired advertisements are never submitted for indexing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();
  const adSlugs = await getPublicAdvertisementSlugs();

  return [
    { url: base, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/classifieds`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/categories`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/advertise`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    ...CATEGORIES.map((category) => ({
      url: `${base}/classifieds/${category.slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    ...adSlugs.map((slug) => ({
      url: `${base}/classifieds/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}
