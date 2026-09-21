'use client';

import { useId, useState } from 'react';

import { ChevronDownIcon } from '@/components/ui/icons';
import { categoryFacets, priceRole } from '@/config/category-fields';
import { LOCATIONS } from '@/config/locations';
import { POSTED_OPTIONS, TYPE_OPTIONS } from '@/lib/classifieds/query';
import { useFilterValue, useQueryNavigation } from '@/lib/classifieds/use-query-navigation';

/**
 * The filter controls themselves, shared by the desktop sidebar and the mobile
 * drawer so the two can never drift apart.
 *
 * Both copies can be in the document at once, so every `id` and radio-group
 * `name` is namespaced with a `useId()` scope. Without it the two would share
 * ids — breaking `label for` associations — and share radio group names, so a
 * selection in one would silently clear the other.
 *
 * Values come from the URL but update optimistically, via `useFilterValue`.
 */
export function FilterControls({ categorySlug }: { categorySlug: string | null }) {
  const scope = useId();
  const { setParams, get } = useQueryNavigation();
  const showPrice = priceRole(categorySlug) !== 'none';
  const facets = categoryFacets(categorySlug);

  return (
    <div className="space-y-6">
      <FilterGroup label="Location">
        <SelectControl
          scope={scope}
          paramKey="location"
          label="Location"
          placeholder="All locations"
          options={LOCATIONS.map((l) => ({ value: l.slug, label: l.name }))}
        />
      </FilterGroup>

      {showPrice ? (
        <FilterGroup label="Price range">
          <PriceRange
            scope={scope}
            min={get('minPrice')}
            max={get('maxPrice')}
            onApply={(min, max) => setParams({ minPrice: min || null, maxPrice: max || null })}
          />
        </FilterGroup>
      ) : null}

      <FilterGroup label="Date posted">
        <RadioList scope={scope} paramKey="posted" anyLabel="Any time" options={POSTED_OPTIONS} />
      </FilterGroup>

      <FilterGroup label="Advertisement type">
        <RadioList scope={scope} paramKey="type" anyLabel="All types" options={TYPE_OPTIONS} />
      </FilterGroup>

      {/* Category-specific filters come from configuration, so adding one
          never means touching this component. */}
      {facets.map((facet) => (
        <FilterGroup key={facet.key} label={facet.label}>
          <RadioList
            scope={scope}
            paramKey={facet.key}
            anyLabel={`Any ${facet.label.toLowerCase()}`}
            options={facet.options}
          />
        </FilterGroup>
      ))}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2.5 text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

function SelectControl({
  scope,
  paramKey,
  label,
  placeholder,
  options,
}: {
  scope: string;
  paramKey: string;
  label: string;
  placeholder: string;
  options: readonly { value: string; label: string }[];
}) {
  const [value, onChange] = useFilterValue(paramKey);
  const id = `${scope}-${paramKey}`;

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        data-filter={paramKey}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-sm border border-line-strong bg-surface pr-9 pl-3 text-sm text-fg transition-colors hover:border-fg-subtle"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
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

/** Radio group with an explicit "any" option, so a filter can be undone. */
function RadioList({
  scope,
  paramKey,
  anyLabel,
  options,
}: {
  scope: string;
  paramKey: string;
  anyLabel: string;
  options: readonly { value: string; label: string }[];
}) {
  const [value, onChange] = useFilterValue(paramKey);
  const groupName = `${scope}-${paramKey}`;

  return (
    <div className="space-y-1">
      {[{ value: '', label: anyLabel }, ...options].map((option) => (
        <label
          key={option.value || 'any'}
          className="flex cursor-pointer items-center gap-2.5 rounded-sm py-1 text-sm text-fg-muted hover:text-fg has-checked:font-medium has-checked:text-fg"
        >
          <input
            type="radio"
            name={groupName}
            data-filter={paramKey}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="h-4 w-4 accent-primary-solid"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/**
 * Price bounds are applied on submit rather than on change: navigating on
 * every keystroke would make a range impossible to type.
 */
function PriceRange({
  scope,
  min,
  max,
  onApply,
}: {
  scope: string;
  min: string;
  max: string;
  onApply: (min: string, max: string) => void;
}) {
  const [from, setFrom] = useState(min);
  const [to, setTo] = useState(max);

  // Re-sync when the URL changes from elsewhere, during render rather than in
  // an effect (see the note in search-panel.tsx).
  const incoming = `${min}\u0000${max}`;
  const [synced, setSynced] = useState(incoming);
  if (incoming !== synced) {
    setSynced(incoming);
    setFrom(min);
    setTo(max);
  }

  const invalid = from !== '' && to !== '' && Number(from) > Number(to);
  const minId = `${scope}-minPrice`;
  const maxId = `${scope}-maxPrice`;
  const errorId = `${scope}-price-error`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label htmlFor={minId} className="sr-only">
            Minimum price
          </label>
          <input
            id={minId}
            data-filter="minPrice"
            type="number"
            inputMode="numeric"
            min={0}
            value={from}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => setFrom(event.target.value)}
            placeholder="Min"
            className="h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm transition-colors hover:border-fg-subtle"
          />
        </div>
        <span aria-hidden="true" className="text-fg-subtle">
          &ndash;
        </span>
        <div className="flex-1">
          <label htmlFor={maxId} className="sr-only">
            Maximum price
          </label>
          <input
            id={maxId}
            data-filter="maxPrice"
            type="number"
            inputMode="numeric"
            min={0}
            value={to}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => setTo(event.target.value)}
            placeholder="Max"
            className="h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm transition-colors hover:border-fg-subtle"
          />
        </div>
      </div>

      {invalid ? (
        <p id={errorId} role="alert" className="text-xs text-critical-fg">
          The minimum is higher than the maximum.
        </p>
      ) : null}

      <button
        type="button"
        disabled={invalid}
        onClick={() => onApply(from, to)}
        className="h-9 w-full rounded-sm border border-line-strong bg-surface-sunken text-sm font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
      >
        Apply price
      </button>
    </div>
  );
}
