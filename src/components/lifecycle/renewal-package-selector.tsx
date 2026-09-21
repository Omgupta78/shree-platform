'use client';

import type { AdvertisementPackageConfig } from '@/config/packages';
import { PRICING_PENDING_NOTE } from '@/config/packages';
import { cn } from '@/lib/utils';

/**
 * Choosing the package a renewal runs on. Selection only — nobody is charged
 * in this phase, and no price is shown because none has been set.
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
              <span className="mt-2 text-sm">
                Runs for <span className="font-medium tabular-nums">{item.durationDays}</span> days
                after approval
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-fg-subtle">{PRICING_PENDING_NOTE}</p>
    </fieldset>
  );
}
