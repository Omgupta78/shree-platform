'use client';

import type { AdvertisementPackageConfig } from '@/config/packages';
import { PRICING_PENDING_NOTE } from '@/config/packages';
import { formatPaiseAsRupees } from '@/lib/format';
import { isChargeable } from '@/lib/payments/amounts';
import { cn } from '@/lib/utils';

/**
 * Choosing the package a renewal runs on.
 *
 * The price shown is the package's current rate, which is what the renewal
 * will be charged — a renewal is priced from the package it names, not from
 * whatever the advertisement originally ran on. The figure here is for
 * reading; the figure charged is read again on the server when the order is
 * raised.
 */
export function RenewalPackageSelector({
  packages,
  value,
  onChange,
}: {
  packages: AdvertisementPackageConfig[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">Renewal package</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {packages.map((item) => {
          const checked = item.id === value;
          return (
            <label
              key={item.id}
              className={cn(
                'flex cursor-pointer flex-col rounded-md border p-4 transition-colors',
                checked ? 'border-primary bg-primary-surface' : 'border-line bg-surface hover:border-fg-subtle',
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="package"
                  value={item.id}
                  checked={checked}
                  onChange={() => onChange(item.id)}
                  className="h-4 w-4"
                />
                <span className="font-medium">{item.name}</span>
              </span>
              <span className="mt-1 text-sm text-fg-muted">{item.summary}</span>
              {isChargeable(item.price) ? (
                <span className="mt-2 font-serif text-xl font-semibold tabular-nums">
                  {formatPaiseAsRupees(item.price)}
                </span>
              ) : null}
              <span className="mt-2 text-sm">
                Runs for <span className="font-medium tabular-nums">{item.durationDays}</span> days
                after approval
              </span>
            </label>
          );
        })}
      </div>
      {packages.some((item) => isChargeable(item.price)) ? (
        <p className="mt-3 text-xs text-fg-subtle">
          You pay for the renewal after submitting it. The new run begins only once our office
          approves it.
        </p>
      ) : (
        <p className="mt-3 text-xs text-fg-subtle">{PRICING_PENDING_NOTE}</p>
      )}
    </fieldset>
  );
}
