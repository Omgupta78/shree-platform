import { categoryFacets } from '@/config/category-fields';

/**
 * The listing query.
 *
 * The URL is the single source of truth for what a visitor is looking at, so
 * any filtered view can be bookmarked, shared or sent over WhatsApp. This
 * module owns the translation in both directions and nothing else.
 */

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'featured', label: 'Featured first' },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]['value'];
const SORT_KEYS = new Set<string>(SORT_OPTIONS.map((option) => option.value));

export const POSTED_OPTIONS = [
  { value: '1', label: 'Today' },
  { value: '3', label: 'Last 3 days' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
] as const;

export const TYPE_OPTIONS = [
  { value: 'featured', label: 'Featured only' },
  { value: 'photo', label: 'With photo' },
  { value: 'boxed', label: 'Boxed' },
  { value: 'line', label: 'Text only' },
] as const;

export type TypeKey = (typeof TYPE_OPTIONS)[number]['value'];
const TYPE_KEYS = new Set<string>(TYPE_OPTIONS.map((option) => option.value));

export const PER_PAGE = 12;

export interface AdQuery {
  /** Free-text search. */
  q: string;
  /** Category slug, or null on the all-classifieds page. */
  category: string | null;
  location: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  /** Published within this many days. */
  postedWithinDays: number | null;
  type: TypeKey | null;
  sort: SortKey;
  page: number;
  /** Category-specific filters, keyed by attribute name. */
  facets: Readonly<Record<string, string>>;
}

/** Query parameters that are not category-specific facets. */
export const RESERVED_PARAMS = [
  'q',
  'location',
  'minPrice',
  'maxPrice',
  'posted',
  'type',
  'sort',
  'page',
] as const;

/** What Next.js hands a page as `searchParams`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function positiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Reads a query out of the URL.
 *
 * Unknown or malformed values fall back to the default rather than throwing —
 * a hand-edited or truncated shared link should still render a page.
 */
export function parseAdQuery(
  searchParams: RawSearchParams,
  categorySlug: string | null = null,
): AdQuery {
  const sortRaw = first(searchParams.sort);
  const typeRaw = first(searchParams.type);
  const postedRaw = positiveInt(first(searchParams.posted));
  const page = positiveInt(first(searchParams.page)) ?? 1;

  // Only facet keys declared for this category are honoured, so an arbitrary
  // query parameter cannot become a filter.
  const facets: Record<string, string> = {};
  for (const facet of categoryFacets(categorySlug)) {
    const value = first(searchParams[facet.key]);
    if (value && facet.options.some((option) => option.value === value)) {
      facets[facet.key] = value;
    }
  }

  return {
    q: (first(searchParams.q) ?? '').trim(),
    category: categorySlug,
    location: first(searchParams.location),
    minPrice: positiveInt(first(searchParams.minPrice)),
    maxPrice: positiveInt(first(searchParams.maxPrice)),
    postedWithinDays: postedRaw && postedRaw > 0 ? postedRaw : null,
    type: typeRaw && TYPE_KEYS.has(typeRaw) ? (typeRaw as TypeKey) : null,
    sort: sortRaw && SORT_KEYS.has(sortRaw) ? (sortRaw as SortKey) : 'newest',
    page: Math.max(1, page),
    facets,
  };
}

/** Serialises a query back to URL parameters, omitting everything at default. */
export function toSearchParams(query: AdQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.location) params.set('location', query.location);
  if (query.minPrice !== null) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== null) params.set('maxPrice', String(query.maxPrice));
  if (query.postedWithinDays) params.set('posted', String(query.postedWithinDays));
  if (query.type) params.set('type', query.type);
  if (query.sort !== 'newest') params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  for (const [key, value] of Object.entries(query.facets)) params.set(key, value);
  return params;
}

/** Base path for a query — the all-classifieds page or a category page. */
export function basePath(categorySlug: string | null): string {
  return categorySlug ? `/classifieds/${categorySlug}` : '/classifieds';
}

/** A URL for this query, optionally with some values replaced. */
export function queryHref(query: AdQuery, overrides: Partial<AdQuery> = {}): string {
  const next: AdQuery = { ...query, ...overrides };
  // Any change other than paging returns to the first page.
  if (overrides.page === undefined) next.page = 1;
  const params = toSearchParams(next);
  const search = params.toString();
  return search ? `${basePath(next.category)}?${search}` : basePath(next.category);
}

/** True when nothing but the defaults is set. */
export function isDefaultQuery(query: AdQuery): boolean {
  return (
    !query.q &&
    !query.location &&
    query.minPrice === null &&
    query.maxPrice === null &&
    !query.postedWithinDays &&
    !query.type &&
    Object.keys(query.facets).length === 0
  );
}

/** A query with every filter cleared, keeping the category and the sort order. */
export function clearedQuery(query: AdQuery): AdQuery {
  return {
    ...query,
    q: '',
    location: null,
    minPrice: null,
    maxPrice: null,
    postedWithinDays: null,
    type: null,
    page: 1,
    facets: {},
  };
}
