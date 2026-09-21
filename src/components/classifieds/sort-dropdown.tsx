'use client';

import { ChevronDownIcon } from '@/components/ui/icons';
import { SORT_OPTIONS, type SortKey } from '@/lib/classifieds/query';
import { useFilterValue } from '@/lib/classifieds/use-query-navigation';

/** Sort control. Writes to the URL like every other filter. */
export function SortDropdown({ value }: { value: SortKey }) {
  const [current, setCurrent] = useFilterValue('sort');

  return (
    <div className="relative">
      <label htmlFor="sort" className="sr-only">
        Sort advertisements
      </label>
      <select
        id="sort"
        value={current || value}
        onChange={(event) =>
          setCurrent(event.target.value === 'newest' ? '' : event.target.value)
        }
        className="h-11 appearance-none rounded-sm border border-line-strong bg-surface pr-9 pl-3 text-sm text-fg transition-colors hover:border-fg-subtle"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            Sort: {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        size={15}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-subtle"
      />
    </div>
  );
}
