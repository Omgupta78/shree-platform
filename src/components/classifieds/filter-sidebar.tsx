'use client';

import { FilterControls } from '@/components/classifieds/filter-controls';
import { useQueryNavigation } from '@/lib/classifieds/use-query-navigation';

/** Desktop filter column. */
export function FilterSidebar({ categorySlug }: { categorySlug: string | null }) {
  const { clearAll, hasFilters } = useQueryNavigation();

  return (
    <aside aria-label="Filters" className="hidden lg:block">
      <div className="sticky top-6 rounded-md border border-line bg-surface p-5">
        <div className="mb-5 flex items-center justify-between border-b border-line pb-3">
          <h2 className="font-serif text-lg font-semibold">Filters</h2>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-medium text-primary hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>
        <FilterControls categorySlug={categorySlug} />
      </div>
    </aside>
  );
}
