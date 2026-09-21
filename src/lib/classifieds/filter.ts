import { CATEGORY_BY_SLUG } from '@/config/categories';
import { locationName } from '@/config/locations';
import type { AdQuery, SortKey } from '@/lib/classifieds/query';
import type { Advertisement } from '@/types/content';

/**
 * Filtering and sorting, as pure functions over a list.
 *
 * Kept free of React and of any data source so the same rules can be read by a
 * test, and so the equivalent Postgres predicates can be written against this
 * file as the specification when the Supabase query replaces it.
 */

/** Text that free-text search looks at: title, body, location and category. */
function haystack(ad: Advertisement): string {
  const category = CATEGORY_BY_SLUG.get(ad.categorySlug);
  return [
    ad.title,
    ad.summary,
    locationName(ad.locationSlug),
    category?.name ?? '',
    ad.contactName,
    ...Object.values(ad.attributes).map(String),
  ]
    .join(' ')
    .toLowerCase();
}

/** Every whitespace-separated term must appear somewhere. */
export function matchesText(ad: Advertisement, q: string): boolean {
  if (!q) return true;
  const text = haystack(ad);
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => text.includes(term));
}

export function matchesFilters(ad: Advertisement, query: AdQuery): boolean {
  if (query.category && ad.categorySlug !== query.category) return false;
  if (query.location && ad.locationSlug !== query.location) return false;

  if (query.type) {
    if (query.type === 'featured' ? !ad.isFeatured : ad.format !== query.type) return false;
  }

  // Price bounds only apply to advertisements that carry a figure. An "on
  // call" advertisement is not excluded by a price range it cannot answer.
  if (ad.price !== null) {
    if (query.minPrice !== null && ad.price < query.minPrice) return false;
    if (query.maxPrice !== null && ad.price > query.maxPrice) return false;
  } else if (query.minPrice !== null || query.maxPrice !== null) {
    return false;
  }

  if (query.postedWithinDays) {
    const cutoff = Date.now() - query.postedWithinDays * 86_400_000;
    if (new Date(ad.publishedAt).getTime() < cutoff) return false;
  }

  for (const [key, value] of Object.entries(query.facets)) {
    if (String(ad.attributes[key] ?? '') !== value) return false;
  }

  return matchesText(ad, query.q);
}

const BY_NEWEST = (a: Advertisement, b: Advertisement) =>
  b.publishedAt.localeCompare(a.publishedAt);

/** Advertisements without a price sort last in either price direction. */
function byPrice(direction: 1 | -1) {
  return (a: Advertisement, b: Advertisement) => {
    if (a.price === null && b.price === null) return BY_NEWEST(a, b);
    if (a.price === null) return 1;
    if (b.price === null) return -1;
    return (a.price - b.price) * direction;
  };
}

const COMPARATORS: Record<SortKey, (a: Advertisement, b: Advertisement) => number> = {
  newest: BY_NEWEST,
  oldest: (a, b) => a.publishedAt.localeCompare(b.publishedAt),
  'price-asc': byPrice(1),
  'price-desc': byPrice(-1),
  featured: (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || BY_NEWEST(a, b),
};

export function sortAdvertisements(
  ads: readonly Advertisement[],
  sort: SortKey,
): Advertisement[] {
  return [...ads].sort(COMPARATORS[sort]);
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
  perPage: number;
}

export function paginate<T>(items: readonly T[], page: number, perPage: number): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    total,
    page: current,
    pageCount,
    perPage,
  };
}
