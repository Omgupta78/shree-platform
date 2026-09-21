import { Suspense } from 'react';

import { CategoryHeader } from '@/components/classifieds/category-header';
import { FilterChips } from '@/components/classifieds/filter-chips';
import { FilterSidebar } from '@/components/classifieds/filter-sidebar';
import { FilterSidebarSkeleton } from '@/components/classifieds/loading-skeleton';
import { Pagination } from '@/components/classifieds/pagination';
import { ResultsPanel } from '@/components/classifieds/results-panel';
import { SearchPanel } from '@/components/classifieds/search-panel';
import { Container } from '@/components/ui/container';
import type { Category } from '@/config/categories';
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
}: {
  query: AdQuery;
  category: Category | null;
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

  const totalLabel = category
    ? `${sectionTotal} live ${sectionTotal === 1 ? 'advertisement' : 'advertisements'} in this section`
    : `${sectionTotal} live ${sectionTotal === 1 ? 'advertisement' : 'advertisements'} across all sections`;

  return (
    <>
      <CategoryHeader category={category} totalLabel={totalLabel} />

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
            <FilterChips query={query} />
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
          </div>
        </div>
      </Container>
    </>
  );
}
