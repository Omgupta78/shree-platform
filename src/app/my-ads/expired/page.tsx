import type { Metadata } from 'next';
import Link from 'next/link';

import { OwnerGate } from '@/components/my-ads/owner-gate';
import { Container } from '@/components/ui/container';
import { EmptyState } from '@/components/ui/states';
import { getLifecycleSettings } from '@/lib/data/lifecycle-settings';
import {
  getMyAdvertisementStates,
  getMyAdvertisementsByIds,
} from '@/lib/data/my-ads';
import { canRequestRenewal, expiryState, formatLongDate } from '@/lib/lifecycle/expiry';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Expired advertisements',
  robots: { index: false, follow: false },
};

/**
 * The advertiser's finished advertisements — expired by the sweep, or past
 * their date and not yet swept. Never shown as active; each can be viewed or
 * sent for renewal.
 */
export default async function ExpiredAdvertisementsPage() {
  return (
    <OwnerGate next="/my-ads/expired">
      <ExpiredAdvertisements />
    </OwnerGate>
  );
}

async function ExpiredAdvertisements() {
  /*
   * Which advertisements have expired is decided from the light states — a
   * status and a date for each — and only the ones that have are then fetched
   * in full. Before Phase 13 this loaded every advertisement the advertiser
   * had ever posted, with its cover image, in order to show the handful that
   * had finished.
   *
   * Not paged: an expired list is bounded by how much somebody has advertised
   * and is read rarely, and the set is already narrowed by the filter.
   */
  const [states, settings] = await Promise.all([
    getMyAdvertisementStates(),
    getLifecycleSettings(),
  ]);
  const now = new Date();

  const expiredIds = states
    .filter(
      (ad) =>
        expiryState(ad.expiresAt, ad.status, settings.expiringSoonDays, now).kind === 'expired',
    )
    .map((ad) => ad.id);

  const expired = (await getMyAdvertisementsByIds(expiredIds)).map((ad) => ({
    ad,
    state: expiryState(ad.expiresAt, ad.status, settings.expiringSoonDays, now),
  }));

  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm">
          <Link href="/my-ads" className="text-fg-muted hover:text-primary">
            ← My advertisements
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Expired advertisements</h1>
        <p className="mt-2 text-[0.9375rem] text-fg-muted">
          These have finished their run and are not shown to readers. Renewing one sends it back to
          our office for review.
        </p>

        <div className="mt-8">
          {expired.length === 0 ? (
            <EmptyState
              title="Nothing has expired"
              description="When an advertisement reaches the end of its run it will appear here."
              action={{ href: '/my-ads', label: 'Back to my advertisements' }}
            />
          ) : (
            <div className="relative -mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[44rem] border-collapse text-sm">
                <caption className="sr-only">Expired advertisements</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-muted">
                    <th scope="col" className="px-3 py-2 font-semibold">Title</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Reference</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Category</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Published</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Expired</th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {expired.map(({ ad, state }) => (
                    <tr key={ad.id} className="border-b border-line align-top">
                      <td className="px-3 py-2.5 font-medium">{ad.title}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{ad.reference}</td>
                      <td className="px-3 py-2.5">{ad.categoryName ?? '—'}</td>
                      <td className="px-3 py-2.5">{formatLongDate(ad.publishedAt) || '—'}</td>
                      <td className="px-3 py-2.5">{formatLongDate(ad.expiresAt) || '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-2">
                          <Link
                            href={`/my-ads/${ad.id}`}
                            className="inline-flex h-8 items-center rounded-sm border border-line-strong px-3 text-sm font-medium hover:bg-surface-sunken"
                          >
                            View
                          </Link>
                          {canRequestRenewal(state, ad.hasPendingRenewal) ? (
                            <Link
                              href={`/my-ads/${ad.id}/renew`}
                              className="inline-flex h-8 items-center rounded-sm bg-primary-solid px-3 text-sm font-medium text-primary-fg hover:bg-primary-solid-hover"
                            >
                              Renew
                            </Link>
                          ) : ad.hasPendingRenewal ? (
                            <span className="self-center text-xs text-fg-muted">Renewal with our office</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
