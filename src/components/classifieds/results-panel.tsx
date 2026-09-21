'use client';

import { useState } from 'react';

import {
  AdvertisementGrid,
  AdvertisementList,
} from '@/components/classifieds/advertisement-grid';
import { NoResults } from '@/components/classifieds/result-states';
import { ResultsToolbar, type ResultsView } from '@/components/classifieds/results-toolbar';
import type { AdQuery } from '@/lib/classifieds/query';
import { useQueryNavigation } from '@/lib/classifieds/use-query-navigation';
import { cn } from '@/lib/utils';
import type { Advertisement } from '@/types/content';

/**
 * The results region.
 *
 * Client-side only so the grid/list toggle can be instant, but it receives
 * just the current page of advertisements — twelve records — rather than the
 * dataset. Filtering, sorting and paging all happen on the server.
 */
export function ResultsPanel({
  query,
  advertisements,
  total,
  categoryName,
}: {
  query: AdQuery;
  advertisements: readonly Advertisement[];
  total: number;
  categoryName?: string;
}) {
  const [view, setView] = useState<ResultsView>('grid');
  const { isPending } = useQueryNavigation();

  return (
    <div>
      <ResultsToolbar query={query} total={total} view={view} onViewChange={setView} />

      {/* Results dim rather than disappear while a new page loads, so the
          page does not jump on every filter change. */}
      <div
        aria-busy={isPending}
        className={cn(
          'mt-6 transition-opacity',
          isPending && 'pointer-events-none opacity-50',
        )}
      >
        {advertisements.length === 0 ? (
          <NoResults categoryName={categoryName} />
        ) : view === 'grid' ? (
          <AdvertisementGrid advertisements={advertisements} />
        ) : (
          <AdvertisementList advertisements={advertisements} />
        )}
      </div>
    </div>
  );
}
