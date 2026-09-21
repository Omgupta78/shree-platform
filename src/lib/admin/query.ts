import type { AdStatus } from '@/types/database';

/**
 * The admin listing query.
 *
 * Deliberately separate from `lib/classifieds/query.ts`. The public query is
 * about what a reader is shopping for; this one is about what the office has
 * to work through, and the two share nothing but the word "filter". Merging
 * them would mean one module that knows about both `status = rejected` and
 * "price low to high", and the day somebody reuses a helper across the two is
 * the day an advertiser's email address appears on a public page.
 */

export const ADMIN_PER_PAGE = 25;

export const ADMIN_SORTS = [
  // The queue opens oldest first — the advertiser at the top has waited
  // longest — which is the brief's "Oldest", named for what it does here.
  { value: 'oldest', label: 'Oldest first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'reports', label: 'Most reported' },
] as const;

export type AdminSort = (typeof ADMIN_SORTS)[number]['value'];
const SORT_KEYS = new Set<string>(ADMIN_SORTS.map((option) => option.value));

export const ADMIN_STATUSES: ReadonlyArray<{ value: AdStatus; label: string }> = [
  { value: 'pending', label: 'Pending review' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: 'sold', label: 'Marked sold' },
  { value: 'draft', label: 'Draft' },
];
const STATUS_KEYS = new Set<string>(ADMIN_STATUSES.map((option) => option.value));

export const ADMIN_PERIODS = [
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
] as const;

export interface AdminAdQuery {
  /** Reference, title, advertiser name, email or telephone. */
  q: string;
  status: AdStatus | null;
  category: string | null;
  location: string | null;
  kind: 'classified' | 'display' | null;
  /** Submitted within this many days. */
  withinDays: number | null;
  sort: AdminSort;
  page: number;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function positiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Reads a query out of the URL.
 *
 * `presetStatus` is how the four queue pages work: `/admin/advertisements/
 * pending` is the all-advertisements page with the status fixed, so there is
 * one list implementation rather than five that drift apart. A status in the
 * URL cannot override the preset — otherwise the "Pending review" page could
 * be made to show approved advertisements, and the heading would be lying.
 */
export function parseAdminQuery(
  searchParams: RawSearchParams,
  presetStatus: AdStatus | null = null,
): AdminAdQuery {
  const statusRaw = first(searchParams.status);
  const sortRaw = first(searchParams.sort);
  const kindRaw = first(searchParams.kind);

  return {
    q: (first(searchParams.q) ?? '').trim().slice(0, 100),
    status:
      presetStatus ??
      (statusRaw && STATUS_KEYS.has(statusRaw) ? (statusRaw as AdStatus) : null),
    category: first(searchParams.category),
    location: first(searchParams.location),
    kind: kindRaw === 'classified' || kindRaw === 'display' ? kindRaw : null,
    withinDays: positiveInt(first(searchParams.period)),
    sort: sortRaw && SORT_KEYS.has(sortRaw) ? (sortRaw as AdminSort) : 'oldest',
    page: Math.max(1, positiveInt(first(searchParams.page)) ?? 1),
  };
}

/** Serialises a query back to URL parameters, omitting everything at default. */
export function toAdminSearchParams(
  query: AdminAdQuery,
  includeStatus: boolean,
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (includeStatus && query.status) params.set('status', query.status);
  if (query.category) params.set('category', query.category);
  if (query.location) params.set('location', query.location);
  if (query.kind) params.set('kind', query.kind);
  if (query.withinDays) params.set('period', String(query.withinDays));
  if (query.sort !== 'oldest') params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

export function adminQueryHref(
  basePath: string,
  query: AdminAdQuery,
  overrides: Partial<AdminAdQuery> = {},
  includeStatus = true,
): string {
  const next: AdminAdQuery = { ...query, ...overrides };
  if (overrides.page === undefined) next.page = 1;
  const search = toAdminSearchParams(next, includeStatus).toString();
  return search ? `${basePath}?${search}` : basePath;
}

export function isDefaultAdminQuery(query: AdminAdQuery, includeStatus: boolean): boolean {
  return (
    !query.q &&
    (!includeStatus || query.status === null) &&
    !query.category &&
    !query.location &&
    !query.kind &&
    !query.withinDays
  );
}
