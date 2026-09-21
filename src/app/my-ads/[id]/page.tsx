import type { Metadata } from 'next';
import Link from 'next/link';

import { ExpiryBadge } from '@/components/lifecycle/expiry-badge';
import { ExpiryNotice } from '@/components/lifecycle/expiry-notice';
import { LifecycleTimeline, type TimelineEvent } from '@/components/lifecycle/lifecycle-timeline';
import { RenewalHistory } from '@/components/lifecycle/renewal-history';
import { OwnerGate } from '@/components/my-ads/owner-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { EmptyState } from '@/components/ui/states';
import { getLifecycleSettings } from '@/lib/data/lifecycle-settings';
import {
  getMyAdvertisementLifecycle,
  STATUS_COPY,
  type MyAdvertisementLifecycle,
} from '@/lib/data/my-ads';
import { expiryState, formatLongDate } from '@/lib/lifecycle/expiry';
import { isEditable } from '@/lib/post-ad/edit';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your advertisement',
  robots: { index: false, follow: false },
};

/**
 * One of your advertisements: where it is in its life, when it runs until,
 * and every renewal it has had. The id comes from the URL and "is it yours"
 * is answered by `owner_ads` — somebody else's id shows the same not-found as
 * an id that does not exist.
 */
export default async function MyAdvertisementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { renewal } = await searchParams;
  return (
    <OwnerGate next={`/my-ads/${id}`}>
      <Detail id={id} renewal={typeof renewal === 'string' ? renewal : null} />
    </OwnerGate>
  );
}

async function Detail({ id, renewal }: { id: string; renewal: string | null }) {
  const [advertisement, settings] = await Promise.all([
    getMyAdvertisementLifecycle(id),
    getLifecycleSettings(),
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
  const lapsed = state.kind === 'expired';
  const status = STATUS_COPY[lapsed ? 'expired' : advertisement.status];
  const pending = advertisement.renewals.some((item) => item.status === 'pending');

  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm">
          <Link href="/my-ads" className="text-fg-muted hover:text-primary">
            ← My advertisements
          </Link>
        </p>

        {renewal ? (
          <p role="status" className="mt-4 rounded-sm border border-positive-surface bg-positive-surface p-3 text-sm text-positive-fg">
            {renewal === 'live'
              ? 'Renewal sent. Your advertisement stays live while our office reviews it.'
              : 'Renewal sent. Your advertisement is with our office for review.'}
          </p>
        ) : null}

        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {!lapsed && advertisement.status === 'approved' ? <ExpiryBadge state={state} /> : null}
            <span className="font-mono text-xs text-fg-subtle">{advertisement.reference}</span>
          </div>
          <h1 className="mt-2 font-serif text-3xl font-semibold">{advertisement.title}</h1>
          <p className="mt-1 text-sm text-fg-muted">{status.note}</p>
        </header>

        <ExpiryNotice
          className="mt-6"
          state={state}
          advertisementId={advertisement.id}
          hasPendingRenewal={pending}
        />

        {advertisement.rejectionReason ? (
          <p className="mt-6 rounded-sm border border-accent-line bg-accent-surface p-3 text-sm text-accent-fg">
            {advertisement.rejectionReason}
          </p>
        ) : null}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="space-y-8">
            <section aria-labelledby="run">
              <h2 id="run" className="font-serif text-xl font-semibold">
                Publication
              </h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <Fact label="Status">{status.label}</Fact>
                <Fact label="Published">{formatLongDate(advertisement.publishedAt) || 'Not yet'}</Fact>
                <Fact label={lapsed ? 'Expired' : 'Expiry date'}>
                  {formatLongDate(advertisement.expiresAt) || 'Set when approved'}
                </Fact>
              </dl>
            </section>

            <section aria-labelledby="renewals">
              <h2 id="renewals" className="font-serif text-xl font-semibold">
                Renewal History
              </h2>
              <div className="mt-3">
                <RenewalHistory renewals={advertisement.renewals} />
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <div className="flex flex-col gap-2">
              {advertisement.status === 'approved' && !lapsed ? (
                <Button href={`/classifieds/${advertisement.slug}`} variant="secondary" size="sm">
                  See it on the site
                </Button>
              ) : null}
              {isEditable(advertisement.status) && !lapsed ? (
                <Button href={`/my-ads/${advertisement.id}/edit`} variant="secondary" size="sm">
                  Edit
                </Button>
              ) : null}
            </div>
            <section aria-labelledby="timeline">
              <h2 id="timeline" className="text-sm font-semibold">
                Timeline
              </h2>
              <div className="mt-3">
                <LifecycleTimeline events={timelineFor(advertisement)} />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </Container>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  );
}

/**
 * The owner's timeline, from facts the owner is allowed to read: the row's
 * own dates and the renewal records. (The office's full audit trail is
 * staff-only; this is its public face.)
 */
function timelineFor(ad: MyAdvertisementLifecycle): TimelineEvent[] {
  const now = Date.now();
  const events: TimelineEvent[] = [{ key: 'created', label: 'Created', at: ad.createdAt }];

  // Renewals oldest first, each closing one run and opening the next.
  const renewals = [...ad.renewals].reverse();
  const firstRunStart = renewals[0]?.previousPublishedAt ?? ad.publishedAt;
  if (firstRunStart) events.push({ key: 'published-0', label: 'Published', at: firstRunStart });

  for (const renewal of renewals) {
    if (renewal.previousExpiresAt && Date.parse(renewal.previousExpiresAt) <= Date.parse(renewal.requestedAt)) {
      events.push({ key: `expired-${renewal.id}`, label: 'Expired', at: renewal.previousExpiresAt });
    }
    events.push({
      key: `requested-${renewal.id}`,
      label: `Renewal #${renewal.renewalNumber} requested`,
      at: renewal.requestedAt,
    });
    if (renewal.status === 'approved') {
      events.push({
        key: `approved-${renewal.id}`,
        label: `Renewal #${renewal.renewalNumber} approved`,
        at: renewal.decidedAt,
        detail: renewal.newExpiresAt ? `Runs until ${formatLongDate(renewal.newExpiresAt)}` : null,
      });
    } else if (renewal.status === 'rejected') {
      events.push({
        key: `rejected-${renewal.id}`,
        label: `Renewal #${renewal.renewalNumber} not approved`,
        at: renewal.decidedAt,
        detail: renewal.decisionNote,
      });
    }
  }

  if (ad.expiresAt) {
    const past = Date.parse(ad.expiresAt) <= now;
    events.push({
      key: 'expiry',
      label: past ? 'Expired' : 'Expires',
      at: ad.expiresAt,
      upcoming: !past,
    });
  }
  return events;
}
