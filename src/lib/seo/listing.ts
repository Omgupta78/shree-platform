import type { AdQuery } from '@/lib/classifieds/query';

/**
 * Which listing URLs are worth indexing, and what each one points at.
 *
 * A browse page takes a category, a place, a price range, a posted-within
 * window, a type, a sort order, a page number and any number of
 * category-specific facets. Multiplied out, that is tens of thousands of URLs
 * over a few hundred advertisements — the doorway-page problem, arrived at by
 * accident rather than intent. Left alone, a crawler spends its budget on
 * "vehicles sorted by price ascending, posted in the last 3 days" and never
 * reaches the advertisements.
 *
 * So the rule is a whitelist, not a blacklist:
 *
 *   INDEXABLE   the section itself — /classifieds, /classifieds/jobs — and
 *               a section in a place where there is genuinely something to
 *               see, plus their numbered pages.
 *
 *   NOT INDEXED everything a visitor narrowed themselves: a search term, a
 *               price band, a sort order, a facet. These keep working, stay
 *               shareable, and remain crawlable for the links they contain —
 *               `follow` is left on — but they do not ask to be ranked, and
 *               they canonicalise to the clean section they are a view of.
 *
 * Pagination is deliberately the other way round from the filters: page two is
 * indexable and canonical to itself. It holds different advertisements from
 * page one, so pointing its canonical at page one would tell a search engine
 * that a hundred advertisements are a duplicate of twelve others.
 */

export interface ListingIndexing {
  /** The path a search engine should treat as the one true address. */
  canonicalPath: string;
  /** Whether this particular view asks to be indexed. */
  index: boolean;
  /** Why, in a sentence — shown in the SEO audit rather than to visitors. */
  reason: string;
}

/**
 * `basePath` is the section's clean URL: `/classifieds`, `/classifieds/jobs`,
 * or a location landing page. Everything else is read from the query.
 */
export function listingIndexing(
  basePath: string,
  query: AdQuery,
  raw: RawParams = {},
): ListingIndexing {
  const narrowed = hasNarrowingFilter(query) || hasExplicitSort(raw);

  if (narrowed) {
    return {
      canonicalPath: basePath,
      index: false,
      reason: 'A filtered or sorted view of a section, not a section of its own.',
    };
  }

  if (query.page > 1) {
    return {
      canonicalPath: `${basePath}?page=${query.page}`,
      index: true,
      reason: 'A later page of the section, holding advertisements page one does not.',
    };
  }

  return { canonicalPath: basePath, index: true, reason: 'The section itself.' };
}

/**
 * Did the visitor narrow this themselves?
 *
 * The sort order counts. "Newest first" is the default and produces the same
 * page as no sort at all, but `?sort=newest` is a different URL for the same
 * content — so any explicit sort in the URL is treated as a narrowing, and the
 * clean address is the canonical one.
 */
export function hasNarrowingFilter(query: AdQuery): boolean {
  return (
    query.q.trim() !== '' ||
    query.location !== null ||
    query.minPrice !== null ||
    query.maxPrice !== null ||
    query.postedWithinDays !== null ||
    query.type !== null ||
    Object.keys(query.facets).length > 0
  );
}

export type RawParams = Record<string, string | string[] | undefined>;

/**
 * Whether an explicit sort is present in the raw URL.
 *
 * Read from the raw parameters rather than from the query, because
 * `parseAdQuery` fills `sort` in with the default — so by the time there is an
 * `AdQuery` there is no telling whether the visitor asked for "newest" or
 * simply arrived. The raw parameters still know.
 */
export function hasExplicitSort(raw: RawParams): boolean {
  return raw.sort !== undefined;
}
