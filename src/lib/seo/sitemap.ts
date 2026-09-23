import 'server-only';

import {
  getPublicAdvertisementPage,
  sitemapAdvertisementCount,
  type SitemapEntry,
} from '@/lib/data/public-ads';
import { isSupabaseConfigured } from '@/lib/env';
import { ADVERTISEMENTS } from '@/lib/mock/advertisements';
import { isActiveListing } from '@/types/content';

/**
 * How the advertisement sitemap is cut up.
 *
 * The specification allows 50,000 URLs and 50 MB per file. Five thousand is
 * well under both, and is chosen for a different reason: a smaller file is
 * re-fetched more cheaply when one advertisement in it changes, and a
 * classifieds section changes constantly. It also means the whole of this
 * site's inventory fits in one or two files for a long time, so the split
 * costs nothing today and is already in place on the day it is needed.
 */
export const SITEMAP_PAGE_SIZE = 5000;

/** The number of advertisement sitemap files, never fewer than one. */
export async function advertisementSitemapCount(): Promise<number> {
  const total = await countAdvertisements();
  return Math.max(1, Math.ceil(total / SITEMAP_PAGE_SIZE));
}

/** One page of advertisements, by zero-based page number. */
export async function advertisementSitemapPage(page: number): Promise<SitemapEntry[]> {
  if (!isSupabaseConfigured) {
    return activeMockEntries().slice(page * SITEMAP_PAGE_SIZE, (page + 1) * SITEMAP_PAGE_SIZE);
  }
  return getPublicAdvertisementPage(page * SITEMAP_PAGE_SIZE, SITEMAP_PAGE_SIZE);
}

async function countAdvertisements(): Promise<number> {
  if (!isSupabaseConfigured) return activeMockEntries().length;
  return sitemapAdvertisementCount();
}

function activeMockEntries(): SitemapEntry[] {
  const now = new Date();
  return ADVERTISEMENTS.filter((ad) => isActiveListing(ad, now)).map((ad) => ({
    slug: ad.slug,
    updatedAt: ad.publishedAt,
  }));
}
