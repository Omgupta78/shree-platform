import 'server-only';

import type { AdQuery } from '@/lib/classifieds/query';
import { PER_PAGE } from '@/lib/classifieds/query';
import { matchesFilters, paginate, sortAdvertisements, type Page } from '@/lib/classifieds/filter';
import { findSimilar } from '@/lib/classifieds/similar';
import {
  countPublicAdvertisements,
  countPublicByCategory,
  countPublicByCategoryAndLocation,
  getPublicAdvertisementBySlug,
  getPublicAdvertisementSlugs as getPublicAdSlugsFromDatabase,
  getExpiredPublicStub,
  getFeaturedPublicAdvertisements,
  getLatestPublicAdvertisements,
  getSimilarPublicAdvertisements,
  queryPublicAdvertisements,
  type ExpiredAdvertisementStub,
} from '@/lib/data/public-ads';
import { isSupabaseConfigured } from '@/lib/env';
import { ADVERTISEMENTS } from '@/lib/mock/advertisements';
import { isActiveListing, type Advertisement } from '@/types/content';
import { CATEGORY_BY_SLUG } from '@/config/categories';

export type { ExpiredAdvertisementStub };

/** The offline dataset, narrowed to what would be public right now. */
function activeMock(): Advertisement[] {
  const now = new Date();
  return ADVERTISEMENTS.filter((ad) => isActiveListing(ad, now));
}

/**
 * The seam between the listing pages and wherever advertisements actually
 * live.
 *
 * Two sources, one shape. With Supabase configured every call goes to
 * `public_ads`; without it the fictional development dataset answers instead,
 * so the site still runs, still looks like itself, and says on screen that it
 * is not connected — rather than crashing, or worse, showing invented listings
 * as though they were real advertisements.
 *
 * No page or component knows which source answered. The pure predicates in
 * `lib/classifieds/filter.ts` remain the specification: the mock branch runs
 * them directly, and `lib/data/public-ads.ts` is their translation into SQL.
 *
 * `server-only` keeps the dataset out of the client bundle — the browser never
 * receives more than the twelve advertisements on the current page.
 */
export type AdvertisementPage = Page<Advertisement>;

export async function queryAdvertisements(query: AdQuery): Promise<AdvertisementPage> {
  if (isSupabaseConfigured) return queryPublicAdvertisements(query);

  const matching = activeMock().filter((ad) => matchesFilters(ad, query));
  const sorted = sortAdvertisements(matching, query.sort);
  return paginate(sorted, query.page, PER_PAGE);
}

/** Live advertisement count per category, for the category index. */
export async function countByCategory(): Promise<Readonly<Record<string, number>>> {
  if (isSupabaseConfigured) return countPublicByCategory();

  const counts: Record<string, number> = {};
  for (const ad of activeMock()) {
    counts[ad.categorySlug] = (counts[ad.categorySlug] ?? 0) + 1;
  }
  return counts;
}

export async function countAll(): Promise<number> {
  if (isSupabaseConfigured) return countPublicAdvertisements();
  return activeMock().length;
}

/**
 * One advertisement by its URL slug.
 *
 * Returns null rather than throwing so the page can render its own not-found
 * state. Against the database the status check is not made here at all — the
 * view only contains approved, unexpired rows, so a pending or rejected
 * advertisement is unreachable by guessing its slug no matter what this
 * function does.
 */
export async function getAdvertisementBySlug(slug: string): Promise<Advertisement | null> {
  if (isSupabaseConfigured) return getPublicAdvertisementBySlug(slug);

  return activeMock().find((ad) => ad.slug === slug) ?? null;
}

/** Every slug that should be reachable, for `generateStaticParams` and the sitemap. */
export async function getPublicAdvertisementSlugs(): Promise<string[]> {
  if (isSupabaseConfigured) return getPublicAdSlugsFromDatabase();
  return activeMock().map((ad) => ad.slug);
}

/** Related advertisements for a detail page, excluding the one being viewed. */
export async function getSimilarAdvertisements(
  advertisement: Advertisement,
  limit = 4,
): Promise<Advertisement[]> {
  if (isSupabaseConfigured) return getSimilarPublicAdvertisements(advertisement, limit);
  return findSimilar(advertisement, activeMock(), limit);
}

/** The homepage's featured band. */
export async function getFeaturedAdvertisements(limit = 4): Promise<Advertisement[]> {
  if (isSupabaseConfigured) return getFeaturedPublicAdvertisements(limit);
  return activeMock().filter((ad) => ad.isFeatured).slice(0, limit);
}

/** The newest live advertisements, optionally within one category. */
export async function getLatestAdvertisements(
  limit = 6,
  categorySlug?: string,
): Promise<Advertisement[]> {
  if (isSupabaseConfigured) return getLatestPublicAdvertisements(limit, categorySlug);
  return activeMock()
    .filter((ad) => !categorySlug || ad.categorySlug === categorySlug)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit);
}

/**
 * An advertisement whose run has ended, for the "Advertisement expired" page.
 * Null for anything that is live, never existed, or was never published.
 */
export async function getExpiredAdvertisement(
  slug: string,
): Promise<ExpiredAdvertisementStub | null> {
  if (isSupabaseConfigured) return getExpiredPublicStub(slug);
  const now = new Date();
  const found = ADVERTISEMENTS.find(
    (ad) =>
      ad.slug === slug &&
      ad.expiresAt !== null &&
      new Date(ad.expiresAt) <= now &&
      (ad.status === 'approved' || ad.status === 'expired'),
  );
  if (!found || !found.expiresAt) return null;
  return {
    slug: found.slug,
    title: found.title,
    categorySlug: found.categorySlug,
    categoryName: CATEGORY_BY_SLUG.get(found.categorySlug)?.name ?? null,
    locationSlug: found.locationSlug,
    endedAt: found.expiresAt,
  };
}

/**
 * Live advertisement counts per category-and-place, for deciding which
 * location landing pages genuinely have something on them.
 *
 * Keyed `"<category>/<location>"`.
 */
export async function countByCategoryAndLocation(): Promise<Readonly<Record<string, number>>> {
  if (isSupabaseConfigured) return countPublicByCategoryAndLocation();

  const counts: Record<string, number> = {};
  for (const ad of activeMock()) {
    const key = `${ad.categorySlug}/${ad.locationSlug}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
