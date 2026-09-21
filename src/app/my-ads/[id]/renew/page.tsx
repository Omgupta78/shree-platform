import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { RenewAdvertisement } from '@/components/lifecycle/renew-advertisement';
import { OwnerGate } from '@/components/my-ads/owner-gate';
import { Badge } from '@/components/ui/badge';
import { Container } from '@/components/ui/container';
import { EmptyState } from '@/components/ui/states';
import { DEFAULT_PACKAGE_ID } from '@/config/packages';
import { getLifecycleSettings } from '@/lib/data/lifecycle-settings';
import { getMyAdvertisementLifecycle, STATUS_COPY } from '@/lib/data/my-ads';
import { getPackageConfigs } from '@/lib/data/packages';
import { canRequestRenewal, expiryState, formatLongDate } from '@/lib/lifecycle/expiry';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Renew your advertisement',
  robots: { index: false, follow: false },
};

/**
 * Renewing. Shows what is being renewed and its last run, then the package
 * choice. Whether it may be renewed is worked out here for the page's sake
 * and again, authoritatively, by `request_renewal()`.
 */
export default async function RenewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <OwnerGate next={`/my-ads/${id}/renew`}>
      <Renew id={id} />
    </OwnerGate>
  );
}

async function Renew({ id }: { id: string }) {
  const [advertisement, settings, packages] = await Promise.all([
    getMyAdvertisementLifecycle(id),
    getLifecycleSettings(),
    getPackageConfigs(),
  ]);

  if (!advertisement) {
    return (
      <Container className="py-16">
        <EmptyState
          title="Advertisement not found"
          description="We could not find that advertisement on your account."
          action={{ href: '/my-ads', label: 'My advertisements' }}
        />
      </Container>
    );
  }

  const state = expiryState(advertisement.expiresAt, advertisement.status, settings.expiringSoonDays);
  const pending = advertisement.renewals.some((item) => item.status === 'pending');
  const status = STATUS_COPY[state.kind === 'expired' ? 'expired' : advertisement.status];
  const initial =
    packages.find((item) => item.id === advertisement.packageId)?.id ??
    packages.find((item) => item.id === DEFAULT_PACKAGE_ID)?.id ??
    packages[0]?.id ??
    '';

  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm">
          <Link href={`/my-ads/${advertisement.id}`} className="text-fg-muted hover:text-primary">
            ← Back to the advertisement
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Renew your advertisement</h1>

        <section aria-label="Advertisement preview" className="mt-6 flex gap-4 rounded-md border border-line bg-surface p-4">
          <div className="relative hidden h-20 w-28 shrink-0 overflow-hidden rounded-sm bg-surface-sunken sm:block">
            {advertisement.coverImageUrl ? (
              <Image src={advertisement.coverImageUrl} alt="" fill sizes="112px" className="object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center text-xs text-fg-subtle">No photo</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xs text-fg-subtle">{advertisement.reference}</p>
            <p className="mt-1 font-medium">{advertisement.title}</p>
            <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{advertisement.description}</p>
          </div>
        </section>

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-line bg-surface px-4 py-3">
            <dt className="text-xs text-fg-muted">Current status</dt>
            <dd className="mt-1">
              <Badge tone={status.tone}>{status.label}</Badge>
            </dd>
          </div>
          <div className="rounded-md border border-line bg-surface px-4 py-3">
            <dt className="text-xs text-fg-muted">Previous publication date</dt>
            <dd className="mt-1 text-sm font-medium">{formatLongDate(advertisement.publishedAt) || '—'}</dd>
          </div>
          <div className="rounded-md border border-line bg-surface px-4 py-3">
            <dt className="text-xs text-fg-muted">
              {state.kind === 'expired' ? 'Previous expiry date' : 'Current expiry date'}
            </dt>
            <dd className="mt-1 text-sm font-medium">{formatLongDate(advertisement.expiresAt) || '—'}</dd>
          </div>
        </dl>

        <div className="mt-8">
          {pending ? (
            <EmptyState
              title="A renewal is already with our office"
              description="We will review it and publish the new run once it is approved."
              action={{ href: `/my-ads/${advertisement.id}`, label: 'See renewal history' }}
            />
          ) : !canRequestRenewal(state, pending) ? (
            <EmptyState
              title="Not due for renewal yet"
              description={
                advertisement.status === 'approved'
                  ? `A live advertisement can be renewed in the last ${settings.expiringSoonDays} days of its run.`
                  : 'Only a live or expired advertisement can be renewed.'
              }
              action={{ href: `/my-ads/${advertisement.id}`, label: 'Back to the advertisement' }}
            />
          ) : packages.length === 0 ? (
            <EmptyState
              title="Renewals are unavailable just now"
              description="No packages could be loaded. Please try again shortly."
            />
          ) : (
            <RenewAdvertisement
              advertisementId={advertisement.id}
              packages={packages}
              initialPackageId={initial}
              goesToReview={state.kind === 'expired'}
            />
          )}
        </div>
      </div>
    </Container>
  );
}
