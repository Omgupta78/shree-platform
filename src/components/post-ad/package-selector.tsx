'use client';

import { usePostAd } from '@/components/post-ad/form-provider';
import { Badge } from '@/components/ui/badge';
import { CheckIcon } from '@/components/ui/icons';
import { PRICING_PENDING_NOTE, type AdvertisementPackageConfig } from '@/config/packages';
import { formatPaiseAsRupees } from '@/lib/format';
import { isChargeable } from '@/lib/payments/amounts';
import { cn } from '@/lib/utils';

/**
 * Package choice.
 *
 * The packages come from the database, with their prices, their run lengths
 * and their image limits — nothing on these cards is a constant in this file.
 * That is not tidiness: an office that wants to change what Standard costs, or
 * how long it runs, changes a row, and the card says the new thing without a
 * deployment.
 *
 * What the form sends is still the package's id and nothing else. The price
 * shown here is for the advertiser to read; the price charged is read again on
 * the server from the same table at the moment the order is raised. A client
 * that could send its own price could send its own discount.
 *
 * While a package carries no price — which is all of them, until Shree
 * Advertising supply their rates — the card says the rate is to be confirmed
 * rather than showing a zero, and the advertisement goes to the office with
 * nothing to collect.
 */
export function PackageSelector({ packages }: { packages: AdvertisementPackageConfig[] }) {
  const { state, dispatch, errorFor } = usePostAd();
  const selected = state.classified.packageId;
  const error = errorFor('packageId');

  const anyPriced = packages.some((item) => isChargeable(item.price));

  return (
    <div className="space-y-4" data-step="package">
      <div
        role="radiogroup"
        aria-label="Advertisement package"
        className="grid gap-4 md:grid-cols-3"
      >
        {packages.map((item) => (
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

      {anyPriced ? (
        <p className="rounded-sm border border-line bg-surface-sunken p-3 text-sm leading-relaxed text-fg-muted">
          You will be asked to pay once the advertisement has been sent. Payment does not publish an
          advertisement — every one is read by our office first.
        </p>
      ) : (
        <p className="rounded-sm border border-accent-line bg-accent-surface p-3 text-sm leading-relaxed text-accent-fg">
          {PRICING_PENDING_NOTE}
        </p>
      )}
    </div>
  );
}

function PackageCard({
  item,
  selected,
  onSelect,
}: {
  item: AdvertisementPackageConfig;
  selected: boolean;
  onSelect: () => void;
}) {
  const priced = isChargeable(item.price);

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
        ) : item.featured ? (
          <Badge tone="featured">Featured</Badge>
        ) : null}
      </span>

      <span className="mt-1 block text-sm text-fg-muted">{item.summary}</span>

      <span
        data-price
        className={cn(
          'mt-4 block',
          priced
            ? 'font-serif text-2xl font-semibold tabular-nums'
            : 'text-sm font-semibold text-fg-subtle',
        )}
      >
        {priced ? formatPaiseAsRupees(item.price) : 'Rate to be confirmed'}
      </span>

      <ul className="mt-4 space-y-1.5 text-sm text-fg-muted">
        {/*
          The run length and the image limit come from the same row as the
          price, so the three cannot drift apart. `usesDefaultDuration` marks a
          package that has no length of its own and takes the site default —
          worth saying plainly rather than showing a number whose source the
          office cannot find when they want to change it.
        */}
        <Feature>
          Runs for <strong className="font-medium tabular-nums">{item.durationDays}</strong> days
          after approval
        </Feature>
        <Feature>
          Up to <strong className="font-medium tabular-nums">{item.maxImages}</strong>{' '}
          {item.maxImages === 1 ? 'photograph' : 'photographs'}
        </Feature>
        {item.features.map((feature) => (
          <Feature key={feature}>{feature}</Feature>
        ))}
      </ul>
    </label>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <CheckIcon size={15} className="mt-0.5 shrink-0 text-positive-fg" />
      <span>{children}</span>
    </li>
  );
}
