import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { SignInRequired } from '@/components/auth/sign-in-required';
import { ExpiryBadge } from '@/components/lifecycle/expiry-badge';
import { ExpiringSoonList } from '@/components/lifecycle/expiring-soon-list';
import { SetupNotice } from '@/components/setup-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { EmptyState } from '@/components/ui/states';
import { ACCOUNT_ACTIONS } from '@/config/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getLifecycleSettings } from '@/lib/data/lifecycle-settings';
import { getMyAdvertisements, STATUS_COPY, type MyAdvertisement } from '@/lib/data/my-ads';
import { isSupabaseConfigured } from '@/lib/env';
import { formatRelative } from '@/lib/format';
import {
  canRequestRenewal,
  expiryState,
  formatLongDate,
  isExpiringSoon,
  type ExpiryState,
} from '@/lib/lifecycle/expiry';
import { summariseMyAdvertisements } from '@/lib/lifecycle/summary';
import { canResubmit, isEditable } from '@/lib/post-ad/edit';

/**
 * Never cached, never prerendered. The page's whole content depends on who is
 * asking, and a cached copy of one advertiser's list is the worst kind of bug
 * to have on a site where advertisements carry telephone numbers.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My advertisements',
  description: 'The advertisements you have booked with Shree Classified.',
  robots: { index: false, follow: false },
};

/**
 * The advertiser's own list.
 *
 * `proxy.ts` has already turned a signed-out visitor away before this renders;
 * the check below is the second line of defence, for the day the proxy's
 * matcher is narrowed and this route falls out of it.
 */
export default async function MyAdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const turnedAway = params.error === 'not-staff';

  if (!isSupabaseConfigured) {
    return (
      <Container className="py-10">
        <SetupNotice />
      </Container>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return (
      <Container className="py-16">
        <SignInRequired next="/my-ads" />
      </Container>
    );
  }

  const [advertisements, settings] = await Promise.all([
    getMyAdvertisements(),
    getLifecycleSettings(),
  ]);
  // One "now" for the whole page, so a row and the count above it can never
  // disagree about whether something has expired.
  const now = new Date();
  const states = new Map(
    advertisements.map((ad) => [
      ad.id,
      expiryState(ad.expiresAt, ad.status, settings.expiringSoonDays, now),
    ]),
  );
  const summary = summariseMyAdvertisements(advertisements, states);
  const expiringSoon = advertisements.filter((ad) => {
    const state = states.get(ad.id);
    return state ? isExpiringSoon(state) : false;
  });

  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-4xl">
        {/*
          Where the proxy sends a signed-in advertiser who asked for /admin.
          Without a word of explanation the redirect looks like the site
          losing its place.
        */}
        {turnedAway ? (
          <p
            role="status"
            className="mb-6 rounded-sm border border-line bg-surface-sunken p-3 text-sm text-fg-muted"
          >
            The admin area is for Shree Classified staff. Here are your own advertisements.
          </p>
        ) : null}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold sm:text-4xl">My advertisements</h1>
            <p className="mt-2 text-[0.9375rem] text-fg-muted">
              Everything you have sent us, and where each one has got to.
            </p>
          </div>
          <Button href={ACCOUNT_ACTIONS.post.href} size="sm">
            {ACCOUNT_ACTIONS.post.label}
          </Button>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {summary.map((stat) => (
            <div key={stat.key} className="rounded-md border border-line bg-surface px-4 py-3">
              <dt className="text-xs text-fg-muted">{stat.label}</dt>
              <dd className="mt-1 font-serif text-2xl font-semibold tabular-nums">
                {stat.href && stat.value > 0 ? (
                  <Link href={stat.href} className="hover:text-primary">
                    {stat.value}
                  </Link>
                ) : (
                  stat.value
                )}
              </dd>
            </div>
          ))}
        </dl>

        {expiringSoon.length ? (
          <section aria-labelledby="expiring-soon" className="mt-8">
            <h2 id="expiring-soon" className="font-serif text-xl font-semibold">
              Expiring Soon
            </h2>
            <ExpiringSoonList
              className="mt-3"
              items={expiringSoon.map((ad) => ({
                id: ad.id,
                title: ad.title,
                reference: ad.reference,
                expiresAt: ad.expiresAt,
                state: states.get(ad.id)!,
                hasPendingRenewal: ad.hasPendingRenewal,
              }))}
            />
          </section>
        ) : null}

        <div className="mt-8">
          {advertisements.length === 0 ? (
            <EmptyState
              title="Nothing here yet"
              description="When you book an advertisement it will appear here, with its progress through our office."
              action={ACCOUNT_ACTIONS.post}
            />
          ) : (
            <ul className="space-y-4">
              {advertisements.map((advertisement) => (
                <li key={advertisement.id}>
                  <AdvertisementRow
                    advertisement={advertisement}
                    state={states.get(advertisement.id)!}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Container>
  );
}

function AdvertisementRow({
  advertisement,
  state,
}: {
  advertisement: MyAdvertisement;
  state: ExpiryState;
}) {
  const lapsed = state.kind === 'expired';
  // An approved advertisement past its date is expired to its owner, whether
  // or not the sweep has reached it yet.
  const status = STATUS_COPY[lapsed ? 'expired' : advertisement.status];
  const live = advertisement.status === 'approved' && !lapsed;
  const renewable = canRequestRenewal(state, advertisement.hasPendingRenewal);

  return (
    <article className="flex gap-4 rounded-md border border-line bg-surface p-4">
      <div className="relative hidden h-20 w-28 shrink-0 overflow-hidden rounded-sm bg-surface-sunken sm:block">
        {advertisement.coverImageUrl ? (
          <Image
            src={advertisement.coverImageUrl}
            alt=""
            fill
            sizes="112px"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-fg-subtle">
            {advertisement.kind === 'display' ? 'Display' : 'No photo'}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {live ? <ExpiryBadge state={state} /> : null}
          {advertisement.hasPendingRenewal ? <Badge tone="warning">Renewal with our office</Badge> : null}
          {advertisement.isFeatured ? <Badge tone="featured">Featured</Badge> : null}
          <span className="font-mono text-xs text-fg-subtle">{advertisement.reference}</span>
        </div>

        <h2 className="mt-1.5 truncate font-medium">
          {live ? (
            <Link href={`/classifieds/${advertisement.slug}`} className="hover:text-primary">
              {advertisement.title}
            </Link>
          ) : (
            advertisement.title
          )}
        </h2>

        <p className="mt-1 text-sm text-fg-muted">{status.note}</p>

        {/*
          The office's message, for either decision that carries one. A refusal
          is shown in the critical colour and a request for a change is not:
          one is an ending, the other is a to-do.
        */}
        {advertisement.rejectionReason ? (
          <p
            className={
              advertisement.status === 'rejected'
                ? 'mt-2 rounded-sm border border-critical-line bg-critical-surface p-2 text-sm text-critical-fg'
                : 'mt-2 rounded-sm border border-accent-line bg-accent-surface p-2 text-sm text-accent-fg'
            }
          >
            {advertisement.status === 'changes_requested' ? (
              <span className="font-medium">Please change: </span>
            ) : null}
            {advertisement.rejectionReason}
          </p>
        ) : null}

        {/*
          The way to act on what the office asked for. A "please change the
          photograph" with no way to change the photograph is a dead end, so
          the button that answers it sits directly under the message.
        */}
        <p className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/my-ads/${advertisement.id}`}
            className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3 text-sm font-medium hover:bg-surface-sunken"
          >
            View
          </Link>
          {isEditable(advertisement.status) && !lapsed ? (
            <Link
              href={`/my-ads/${advertisement.id}/edit`}
              className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3 text-sm font-medium hover:bg-surface-sunken"
            >
              {canResubmit(advertisement.status) ? 'Edit and send it back' : 'Edit'}
            </Link>
          ) : null}
          {renewable ? (
            <Link
              href={`/my-ads/${advertisement.id}/renew`}
              className="inline-flex h-9 items-center rounded-sm bg-primary-solid px-3 text-sm font-medium text-primary-fg hover:bg-primary-solid-hover"
            >
              Renew Advertisement
            </Link>
          ) : null}
        </p>

        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-subtle">
          <div className="flex gap-1">
            <dt>Sent</dt>
            <dd className="text-fg-muted">{formatRelative(advertisement.createdAt)}</dd>
          </div>
          {lapsed && advertisement.expiresAt ? (
            <div className="flex gap-1">
              <dt>Expired</dt>
              <dd className="text-fg-muted">{formatLongDate(advertisement.expiresAt)}</dd>
            </div>
          ) : null}
          {live ? (
            <div className="flex gap-1">
              <dt>Views</dt>
              <dd className="tabular-nums text-fg-muted">{advertisement.viewCount}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </article>
  );
}
