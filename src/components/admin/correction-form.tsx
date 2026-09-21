'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { correctAdvertisementAction } from '@/app/admin/actions';
import { Button } from '@/components/ui/button';
import { CATEGORIES } from '@/config/categories';
import { LOCATIONS } from '@/config/locations';
import { MAX_NOTE } from '@/lib/admin/moderation';

/**
 * "Edit" for the office: fix a typo, move an advertisement to the right
 * category, correct its location.
 *
 * Only those four fields. Price, contact details and photographs belong to the
 * advertiser — the office asks for those with "Request changes". A note is
 * required and goes into the history, so the advertiser's own wording is never
 * changed without a record of who changed it and why. The status is left
 * alone: a correction is not an approval.
 */
export function CorrectionForm({
  advertisementId,
  kind,
  title,
  description,
  categorySlug,
  locationSlug,
}: {
  advertisementId: string;
  kind: 'classified' | 'display';
  title: string;
  description: string;
  categorySlug: string | null;
  locationSlug: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    title,
    description,
    categorySlug: categorySlug ?? '',
    locationSlug: locationSlug ?? '',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set =
    (key: keyof typeof values) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((current) => ({ ...current, [key]: event.target.value }));
      setSaved(false);
    };

  const unchanged =
    values.title === title &&
    values.description === description &&
    values.categorySlug === (categorySlug ?? '') &&
    values.locationSlug === (locationSlug ?? '');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await correctAdvertisementAction({ advertisementId, ...values });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? 'That could not be saved.');
      return;
    }
    setValues((current) => ({ ...current, note: '' }));
    setSaved(true);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Edit advertisement
        </Button>
        {saved ? (
          <span role="status" className="text-sm text-positive-fg">
            Correction saved and recorded in the history.
          </span>
        ) : (
          <span className="text-xs text-fg-subtle">
            Title, description, category and location only.
          </span>
        )}
      </div>
    );
  }

  const field =
    'w-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-sm';

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3 px-4 py-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Title</span>
        <input
          value={values.title}
          onChange={set('title')}
          maxLength={120}
          required
          className={field}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Description</span>
        <textarea
          value={values.description}
          onChange={set('description')}
          rows={6}
          maxLength={5000}
          className={field}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Category</span>
          <select value={values.categorySlug} onChange={set('categorySlug')} className={field}>
            {kind === 'display' ? <option value="">No category</option> : null}
            {CATEGORIES.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Location</span>
          <select value={values.locationSlug} onChange={set('locationSlug')} className={field}>
            {LOCATIONS.map((location) => (
              <option key={location.slug} value={location.slug}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">What you changed, and why</span>
        <textarea
          value={values.note}
          onChange={set('note')}
          rows={2}
          maxLength={MAX_NOTE}
          required
          placeholder="e.g. Moved to Property — Rent; it is a rental, not a sale."
          className={field}
        />
        <span className="mt-1 block text-xs text-fg-subtle">
          Recorded in the history with your name. Required.
        </span>
      </label>

      {error ? (
        <p role="alert" className="text-sm text-critical-fg">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy || unchanged || !values.note.trim()}>
          {busy ? 'Saving…' : 'Save correction'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
            setValues({
              title,
              description,
              categorySlug: categorySlug ?? '',
              locationSlug: locationSlug ?? '',
              note: '',
            });
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
