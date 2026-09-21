'use client';

import { useState } from 'react';

import { updatePackageAction } from '@/app/admin/packages/actions';
import { Button } from '@/components/ui/button';
import { formatPaiseAsRupees } from '@/lib/format';
import { isChargeable } from '@/lib/payments/amounts';
import type { PackageRow } from '@/types/database';

/**
 * One package, editable.
 *
 * The price is typed in rupees because that is what the office quotes, and
 * converted to paise by the action before it is stored — money is an integer
 * of the smallest unit everywhere behind this form, so that ₹199.00 cannot
 * become ₹198.99999 on its way through a float.
 *
 * Leaving the price empty is a real answer and not a missing one. It means the
 * office has not quoted a rate, which is where every package starts; the site
 * then takes the advertisement with nothing to collect rather than showing a
 * customer a free advertisement nobody offered them.
 */
export function PackageEditor({ item }: { item: PackageRow }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);

  async function save(formData: FormData) {
    setBusy(true);
    setNote(null);
    const result = await updatePackageAction(formData);
    setBusy(false);
    setNote({ ok: result.ok, message: result.message ?? (result.ok ? 'Saved.' : 'Not saved.') });
  }

  return (
    <form
      action={(formData) => void save(formData)}
      data-package={item.id}
      className="rounded-md border border-line bg-surface p-4 sm:p-5"
    >
      <input type="hidden" name="id" value={item.id} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold">{item.name}</h3>
        <span className="text-sm text-fg-subtle">
          {isChargeable(item.price_paise)
            ? `Currently ${formatPaiseAsRupees(item.price_paise)}`
            : 'No rate quoted'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input name="name" defaultValue={item.name} maxLength={60} required className={INPUT} />
        </Field>

        <Field label="Price in rupees" hint="Leave empty for “no rate quoted”.">
          <input
            name="priceRupees"
            inputMode="decimal"
            placeholder="e.g. 199"
            defaultValue={item.price_paise === null ? '' : String(item.price_paise / 100)}
            className={INPUT}
          />
        </Field>

        <Field label="Summary" className="sm:col-span-2">
          <input
            name="summary"
            defaultValue={item.summary}
            maxLength={200}
            required
            className={INPUT}
          />
        </Field>

        <Field label="Run length in days" hint="Empty uses the site default.">
          <input
            name="durationDays"
            inputMode="numeric"
            defaultValue={item.duration_days === null ? '' : String(item.duration_days)}
            className={INPUT}
          />
        </Field>

        <Field label="Photograph limit">
          <input
            name="maxImages"
            type="number"
            min={0}
            max={20}
            defaultValue={item.max_images}
            className={INPUT}
          />
        </Field>

        <Field label="Listing precedence" hint="0 to 100. Higher sorts first.">
          <input
            name="priority"
            type="number"
            min={0}
            max={100}
            defaultValue={item.priority}
            className={INPUT}
          />
        </Field>

        <div className="flex flex-col justify-end gap-2 pb-1">
          <Checkbox name="featured" defaultChecked={item.featured_eligible}>
            Eligible for featured placement
          </Checkbox>
          <Checkbox name="isActive" defaultChecked={item.is_active}>
            On sale
          </Checkbox>
        </div>
      </div>

      {note ? (
        <p
          role="status"
          className={
            note.ok
              ? 'mt-4 text-sm font-medium text-positive-fg'
              : 'mt-4 text-sm font-medium text-critical-fg'
          }
        >
          {note.message}
        </p>
      ) : null}

      <div className="mt-4">
        <Button type="submit" size="sm" disabled={busy} aria-busy={busy || undefined}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

const INPUT =
  'h-9 w-full rounded-sm border border-line bg-surface px-2 text-sm ' +
  'focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-primary';

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-fg-subtle">{hint}</span> : null}
    </label>
  );
}

function Checkbox({
  name,
  defaultChecked,
  children,
}: {
  name: string;
  defaultChecked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4" />
      {children}
    </label>
  );
}
