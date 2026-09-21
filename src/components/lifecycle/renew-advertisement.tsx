'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { requestRenewalAction } from '@/app/my-ads/lifecycle-actions';
import { RenewalPackageSelector } from '@/components/lifecycle/renewal-package-selector';
import { PaymentPanel } from '@/components/payments/payment-panel';
import { Button } from '@/components/ui/button';
import type { AdvertisementPackageConfig } from '@/config/packages';

/**
 * The renewal form. Sends an id and a package; everything else is decided by
 * the database.
 *
 * Where the chosen package carries a rate, the checkout opens here rather than
 * on the advertisement's page: the renewal has been asked for, and paying for
 * it is the next thing to do, not a separate errand. Where it does not — every
 * package, until the office supplies rates — the behaviour is exactly Phase
 * 8's, and the form goes straight to the advertisement.
 *
 * Paying does not renew anything. The renewal waits in the queue either way,
 * and the new run starts when the office approves it; the database refuses to
 * extend a priced run that has not been paid for, which is the rule this page
 * merely follows.
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
  const [toPay, setToPay] = useState<{ renewalId: string; outcome: string } | null>(null);

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
    if (result.paymentDue && result.renewalId) {
      setBusy(false);
      setToPay({ renewalId: result.renewalId, outcome: result.outcome ?? 'review' });
      return;
    }
    router.push(`/my-ads/${advertisementId}?renewal=${result.outcome ?? 'review'}`);
    router.refresh();
  }

  if (toPay) {
    return (
      <div className="space-y-4">
        <p className="rounded-sm border border-line bg-surface-sunken p-3 text-sm text-fg-muted">
          Your renewal has been recorded. Pay for it below and our office will review it —
          {toPay.outcome === 'live'
            ? ' your advertisement stays live in the meantime.'
            : ' your advertisement is published again once the renewal is approved.'}
        </p>
        <PaymentPanel
          advertisementId={advertisementId}
          purpose="renewal"
          renewalId={toPay.renewalId}
          onPaid={() => router.refresh()}
        >
          <p className="mt-4">
            <Link
              href={`/my-ads/${advertisementId}?renewal=${toPay.outcome}`}
              className="font-medium underline underline-offset-2"
            >
              Back to the advertisement
            </Link>
          </p>
        </PaymentPanel>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <RenewalPackageSelector packages={packages} value={packageId} onChange={setPackageId} />

      <p className="rounded-sm border border-line bg-surface-sunken p-3 text-sm text-fg-muted">
        {goesToReview
          ? 'Your advertisement goes back to our office for review. It is published again, with a new expiry date, once it is approved.'
          : 'Your advertisement stays live while our office reviews the renewal. Once approved, the new run is added to the end of the current one.'}
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
