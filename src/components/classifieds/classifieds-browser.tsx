import { Suspense, type ReactNode } from 'react';

import { CategoryHeader } from '@/components/classifieds/category-header';
import { FilterChips } from '@/components/classifieds/filter-chips';
import { FilterSidebar } from '@/components/classifieds/filter-sidebar';
import { FilterSidebarSkeleton } from '@/components/classifieds/loading-skeleton';
import { Pagination } from '@/components/classifieds/pagination';
import { ResultsPanel } from '@/components/classifieds/results-panel';
import { SearchPanel } from '@/components/classifieds/search-panel';
import { SearchRecorder } from '@/components/classifieds/search-recorder';
import { Container } from '@/components/ui/container';
import type { Category } from '@/config/categories';
import type { LocationOption } from '@/config/locations';
import type { AdQuery } from '@/lib/classifieds/query';
import { countAll, countByCategory, queryAdvertisements } from '@/lib/data/classifieds-repository';

/**
 * The browsing page, shared by `/classifieds` and every category route.
 *
 * A Server Component: it runs the query and renders the results, so the
 * browser is never sent more than the page it is showing. The interactive
 * pieces — search, filters, sort, view toggle — are the only client
 * components, and they work by changing the URL.
 */
export async function ClassifiedsBrowser({
  query,
  category,
  place = null,
  intro,
  baseUrl,
  belowResults,
}: {
  query: AdQuery;
  category: Category | null;
  /** Set on a location landing page, which is this browser scoped to a place. */
  place?: LocationOption | null;
  intro?: string;
  /** Absolute site URL, so the breadcrumb trail can emit its structured data. */
  baseUrl?: string;
  /** Extra links under the results — the sibling places for a landing page. */
  belowResults?: ReactNode;
}) {
  const [results, sectionTotal] = await Promise.all([
    queryAdvertisements(query),
    // The heading reports how much is in the section regardless of filters;
    // the toolbar above the results reports how many match them. Showing the
    // filtered figure in both places reads as though the section itself were
    // nearly empty.
    category
      ? countByCategory().then((counts) => counts[category.slug] ?? 0)
      : countAll(),
  ]);

  const plural = (n: number) => (n === 1 ? 'advertisement' : 'advertisements');
  const totalLabel = place
    ? // On a landing page the heading figure is the place's own, because the
      // section's total would describe a different page from the one shown.
      `${results.total} live ${plural(results.total)} in ${place.name}`
    : category
      ? `${sectionTotal} live ${plural(sectionTotal)} in this section`
      : `${sectionTotal} live ${plural(sectionTotal)} across all sections`;

  return (
    <>
      {/*
        Only when words were actually typed, and only on the first page: pages
        two and three of one search are the same question asked once.
      */}
      {query.q.trim().length >= 2 && results.page === 1 ? (
        <SearchRecorder
          term={query.q.trim()}
          resultCount={results.total}
          categorySlug={query.category}
        />
      ) : null}

      <CategoryHeader
        category={category}
        totalLabel={totalLabel}
        place={place}
        intro={intro}
        baseUrl={baseUrl}
      />

      <Container className="py-8">
        <Suspense fallback={<div className="h-[5.5rem] rounded-md border border-line bg-surface" />}>
          <SearchPanel
            initialQuery={query.q}
            initialLocation={query.location}
            categorySlug={query.category}
          />
        </Suspense>

        <div className="mt-6">
          <Suspense fallback={null}>
            <FilterChips query={query} fixedLocation={place !== null} />
          </Suspense>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
          <Suspense fallback={<FilterSidebarSkeleton />}>
            <FilterSidebar categorySlug={query.category} />
          </Suspense>

          <div>
            <Suspense fallback={null}>
              <ResultsPanel
                query={query}
                advertisements={results.items}
                total={results.total}
                categoryName={category?.name}
              />
            </Suspense>

            <Pagination query={query} page={results.page} pageCount={results.pageCount} />

            {belowResults}
          </div>
        </div>
      </Container>
    </>
  );
}
