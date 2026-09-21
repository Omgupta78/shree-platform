'use client';

import { usePostAd } from '@/components/post-ad/form-provider';
import { Badge } from '@/components/ui/badge';
import { CheckIcon } from '@/components/ui/icons';
import { AD_PACKAGES, PRICING_CONFIGURED, PRICING_PENDING_NOTE, type AdPackage } from '@/config/packages';
import { cn } from '@/lib/utils';

/**
 * Package choice.
 *
 * No prices, because none have been set. Every card says pricing is to be
 * confirmed, and the form sends only the package's id — what a package costs
 * is resolved on the server from the package record, never taken from the
 * browser. A client that could send its own price could send its own
 * discount.
 */
export function PackageSelector() {
  const { state, dispatch, errorFor } = usePostAd();
  const selected = state.classified.packageId;
  const error = errorFor('packageId');

  return (
    <div className="space-y-4" data-step="package">
      <div
        role="radiogroup"
        aria-label="Advertisement package"
        className="grid gap-4 md:grid-cols-3"
      >
        {AD_PACKAGES.map((item) => (
          <PackageCard
            key={item.id}
            item={item}
            selected={selected === item.id}
            onSelect={() => {
              dispatch({ type: 'setClassified', key: 'packageId', value: item.id });
              dispatch({ type: 'touch', path: 'packageId' });
            }}
          />
        ))}
      </div>

      {error ? <p className="text-sm font-medium text-critical-fg">{error}</p> : null}

      {!PRICING_CONFIGURED ? (
        <p className="rounded-sm border border-accent-line bg-accent-surface p-3 text-sm leading-relaxed text-accent-fg">
          {PRICING_PENDING_NOTE}
        </p>
      ) : null}
    </div>
  );
}

function PackageCard({
  item,
  selected,
  onSelect,
}: {
  item: AdPackage;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      data-package={item.id}
      className={cn(
        'flex cursor-pointer flex-col rounded-md border bg-surface p-5 transition-colors',
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
        selected ? 'border-primary bg-primary-surface' : 'border-line hover:border-line-strong',
      )}
    >
      <input
        type="radio"
        name="packageId"
        value={item.id}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />

      <span className="flex items-center justify-between gap-2">
        <span className="font-serif text-lg font-semibold">{item.name}</span>
        {selected ? (
          <CheckIcon size={18} className="text-primary" />
        ) : item.highlighted ? (
          <Badge tone="featured">Popular</Badge>
        ) : null}
      </span>

      <span className="mt-1 block text-sm text-fg-muted">{item.summary}</span>

      <span className="mt-4 block text-sm font-semibold text-fg-subtle">
        {item.price === null ? 'Pricing to be configured' : `₹${item.price / 100}`}
      </span>

      <ul className="mt-4 space-y-1.5 text-sm text-fg-muted">
        {item.features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <CheckIcon size={15} className="mt-0.5 shrink-0 text-positive-fg" />
            {feature}
          </li>
        ))}
      </ul>
    </label>
  );
}
