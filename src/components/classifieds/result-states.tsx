'use client';

import { AlertIcon, SearchIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { useQueryNavigation } from '@/lib/classifieds/use-query-navigation';

/**
 * No results.
 *
 * The clear-filters button is only offered when something is actually
 * filtered — otherwise the category is genuinely empty and clearing would
 * change nothing, which is a frustrating thing to click.
 */
export function NoResults({ categoryName }: { categoryName?: string }) {
  const { clearAll, hasFilters } = useQueryNavigation();

  return (
    <div className="rounded-md border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken text-fg-subtle">
        <SearchIcon size={24} />
      </span>

      <h2 className="mt-5 font-serif text-xl font-semibold">No advertisements found.</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">
        {hasFilters
          ? 'Try changing your search or filters.'
          : `There are no live advertisements in ${categoryName ?? 'this section'} at the moment. New ones are published every week.`}
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {hasFilters ? (
          <Button onClick={clearAll}>Clear Filters</Button>
        ) : (
          <Button href="/classifieds">Browse all classifieds</Button>
        )}
        <Button href="/post-ad" variant="secondary">
          Post an advertisement
        </Button>
      </div>
    </div>
  );
}

/**
 * Reusable error state for the results region. Paired with the route-level
 * `error.tsx`, which supplies `reset`.
 */
export function ResultsError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-critical-line bg-critical-surface px-6 py-14 text-center"
    >
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface text-critical-fg">
        <AlertIcon size={24} />
      </span>
      <h2 className="mt-5 font-serif text-xl font-semibold text-critical-fg">
        Something went wrong while loading advertisements.
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
        This is usually temporary. Please try again in a moment.
      </p>
      {onRetry ? (
        <Button variant="secondary" className="mt-7" onClick={onRetry}>
          Try Again
        </Button>
      ) : null}
    </div>
  );
}
