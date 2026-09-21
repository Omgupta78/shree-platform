'use client';

import { MobileFilterDrawer } from '@/components/classifieds/mobile-filter-drawer';
import { SortDropdown } from '@/components/classifieds/sort-dropdown';
import { GridIcon, ListIcon } from '@/components/ui/icons';
import type { AdQuery } from '@/lib/classifieds/query';
import { cn } from '@/lib/utils';

export type ResultsView = 'grid' | 'list';

/**
 * The bar above the results: count, mobile filter trigger, view toggle and
 * sort. The view toggle is local state rather than a URL parameter — it is a
 * display preference, not part of what is being looked at, so it does not
 * belong in a shared link.
 */
export function ResultsToolbar({
  query,
  total,
  view,
  onViewChange,
}: {
  query: AdQuery;
  total: number;
  view: ResultsView;
  onViewChange: (view: ResultsView) => void;
}) {
  const activeCount =
    (query.location ? 1 : 0) +
    (query.minPrice !== null || query.maxPrice !== null ? 1 : 0) +
    (query.postedWithinDays ? 1 : 0) +
    (query.type ? 1 : 0) +
    Object.keys(query.facets).length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <p className="text-sm">
        <strong className="font-semibold tabular-nums">{total}</strong>{' '}
        <span className="text-fg-muted">
          {total === 1 ? 'advertisement' : 'advertisements'}
        </span>
      </p>

      <div className="flex items-center gap-2">
        <MobileFilterDrawer
          categorySlug={query.category}
          activeCount={activeCount}
          resultCount={total}
        />

        <div
          role="group"
          aria-label="Result layout"
          className="hidden overflow-hidden rounded-sm border border-line-strong sm:flex"
        >
          <ViewButton
            active={view === 'grid'}
            onClick={() => onViewChange('grid')}
            label="Grid view"
          >
            <GridIcon size={16} />
          </ViewButton>
          <ViewButton
            active={view === 'list'}
            onClick={() => onViewChange('list')}
            label="List view"
          >
            <ListIcon size={16} />
          </ViewButton>
        </div>

        <SortDropdown value={query.sort} />
      </div>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-11 w-11 items-center justify-center transition-colors',
        active ? 'bg-surface-sunken text-primary' : 'bg-surface text-fg-subtle hover:text-fg',
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
