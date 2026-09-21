import Link from 'next/link';

import { ExpiryBadge } from '@/components/lifecycle/expiry-badge';
import { ExpiryNotice } from '@/components/lifecycle/expiry-notice';
import { Container } from '@/components/ui/container';
import { getLifecycleSettings } from '@/lib/data/lifecycle-settings';
import { getOwnedAdvertisementBySlug, STATUS_COPY } from '@/lib/data/my-ads';
import { isSupabaseConfigured } from '@/lib/env';
import { expiryState, formatLongDate } from '@/lib/lifecycle/expiry';

/**
 * A strip above a live advertisement, for its owner only.
 *
 * Who the owner is comes from `owner_ads`, which is empty for a signed-out
 * visitor and for everybody else — so there is no "is this the owner" flag
 * in this file to get wrong, and a stranger's render never includes the
 * status, the dates or the renew button.
 */
export async function OwnerAdvertisementPanel({ slug }: { slug: string }) {
  if (!isSupabaseConfigured) return null;
  const [owned, settings] = await Promise.all([
    getOwnedAdvertisementBySlug(slug),
    getLifecycleSettings(),
  ]);
  if (!owned) return null;

  const state = expiryState(owned.expiresAt, owned.status, settings.expiringSoonDays);
  const status = STATUS_COPY[state.kind === 'expired' ? 'expired' : owned.status];

  return (
    <Container className="pt-6">
      <aside
        aria-label="Your advertisement"
        className="rounded-md border border-line bg-surface p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">This is your advertisement</p>
          <Link href={`/my-ads/${owned.id}`} className="text-sm text-primary hover:underline">
            Manage it
          </Link>
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-fg-muted">Status</dt>
            <dd className="font-medium">{status.label}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-fg-muted">Published</dt>
            <dd className="font-medium">{formatLongDate(owned.publishedAt) || '—'}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-fg-muted">Expiry date</dt>
            <dd className="font-medium">{formatLongDate(owned.expiresAt) || '—'}</dd>
            <ExpiryBadge state={state} />
          </div>
        </dl>
        <ExpiryNotice
          className="mt-3"
          state={state}
          advertisementId={owned.id}
          hasPendingRenewal={owned.hasPendingRenewal}
        />
      </aside>
    </Container>
  );
}

/** For the expired page: the owner's notice and link, or nothing. */
export async function ownerExpiredContext(slug: string) {
  if (!isSupabaseConfigured) return null;
  const [owned, settings] = await Promise.all([
    getOwnedAdvertisementBySlug(slug),
    getLifecycleSettings(),
  ]);
  if (!owned) return null;
  return {
    advertisementId: owned.id,
    state: expiryState(owned.expiresAt, owned.status, settings.expiringSoonDays),
    hasPendingRenewal: owned.hasPendingRenewal,
  };
}
