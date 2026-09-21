'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { requestRenewalAction } from '@/app/my-ads/lifecycle-actions';
import { RenewalPackageSelector } from '@/components/lifecycle/renewal-package-selector';
import { Button } from '@/components/ui/button';
import type { AdvertisementPackageConfig } from '@/config/packages';

/**
 * The renewal form. Sends an id and a package; everything else is decided by
 * the database. On success it goes to the advertisement's page, where the
 * renewal now shows in the history.
 */
export function RenewAdvertisement({
  advertisementId,
  packages,
  initialPackageId,
  goesToReview,
}: {
  advertisementId: string;
  packages: AdvertisementPackageConfig[];
  initialPackageId: string;
  /** True for an expired advertisement; an early renewal stays live meanwhile. */
  goesToReview: boolean;
}) {
  const router = useRouter();
  const [packageId, setPackageId] = useState(initialPackageId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await requestRenewalAction({ advertisementId, packageId });
    if (!result.ok) {
      setBusy(false);
      setError(result.message ?? 'That could not be sent.');
      return;
    }
    router.push(`/my-ads/${advertisementId}?renewal=${result.outcome ?? 'review'}`);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <RenewalPackageSelector packages={packages} value={packageId} onChange={setPackageId} />

      <p className="rounded-sm border border-line bg-surface-sunken p-3 text-sm text-fg-muted">
        {goesToReview
          ? 'Your advertisement goes back to our office for review. It is published again, with a new expiry date, once it is approved.'
          : 'Your advertisement stays live while our office reviews the renewal. Once approved, the new run is added to the end of the current one.'}{' '}
        You will not be charged on this page.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-critical-fg">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={busy || !packageId} aria-busy={busy || undefined}>
        {busy ? 'Submitting…' : 'Submit Renewal'}
      </Button>
    </form>
  );
}
