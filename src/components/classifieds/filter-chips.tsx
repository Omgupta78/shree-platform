'use client';

import { CloseIcon } from '@/components/ui/icons';
import { categoryFacets } from '@/config/category-fields';
import { locationName } from '@/config/locations';
import { POSTED_OPTIONS, TYPE_OPTIONS, type AdQuery } from '@/lib/classifieds/query';
import { useQueryNavigation } from '@/lib/classifieds/use-query-navigation';
import { formatPrice } from '@/lib/format';

interface Chip {
  /** URL parameters cleared when this chip is removed. */
  keys: string[];
  label: string;
}

/**
 * The filters currently in force, each removable.
 *
 * Without this, a visitor who arrives on a shared link has no way of telling
 * why they are seeing four results rather than forty.
 */
export function FilterChips({ query }: { query: AdQuery }) {
  const { setParams, clearAll } = useQueryNavigation();

  const chips: Chip[] = [];

  if (query.q) chips.push({ keys: ['q'], label: `“${query.q}”` });
  if (query.location) {
    chips.push({ keys: ['location'], label: locationName(query.location) });
  }

  if (query.minPrice !== null || query.maxPrice !== null) {
    const from = query.minPrice !== null ? formatPrice(query.minPrice, 'fixed') : null;
    const to = query.maxPrice !== null ? formatPrice(query.maxPrice, 'fixed') : null;
    const label =
      from && to ? `${from} – ${to}` : from ? `From ${from}` : to ? `Up to ${to}` : '';
    chips.push({ keys: ['minPrice', 'maxPrice'], label });
  }

  if (query.postedWithinDays) {
    const option = POSTED_OPTIONS.find(
      (item) => item.value === String(query.postedWithinDays),
    );
    chips.push({ keys: ['posted'], label: option?.label ?? `Last ${query.postedWithinDays} days` });
  }

  if (query.type) {
    const option = TYPE_OPTIONS.find((item) => item.value === query.type);
    if (option) chips.push({ keys: ['type'], label: option.label });
  }

  for (const facet of categoryFacets(query.category)) {
    const value = query.facets[facet.key];
    if (!value) continue;
    const option = facet.options.find((item) => item.value === value);
    chips.push({ keys: [facet.key], label: `${facet.label}: ${option?.label ?? value}` });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
        Filtered by
      </span>

      {chips.map((chip) => (
        <button
          key={chip.keys.join('-')}
          type="button"
          onClick={() => setParams(Object.fromEntries(chip.keys.map((key) => [key, null])))}
          className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface py-1 pr-1.5 pl-2.5 text-sm transition-colors hover:border-primary hover:text-primary"
        >
          {chip.label}
          <CloseIcon size={13} />
          <span className="sr-only">Remove this filter</span>
        </button>
      ))}

      {chips.length > 1 ? (
        <button
          type="button"
          onClick={clearAll}
          className="text-sm font-medium text-primary hover:underline"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}
