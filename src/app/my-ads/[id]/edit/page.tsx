import type { Metadata } from 'next';
import { SITE } from '@/config/site';
import Link from 'next/link';

import { SignInRequired } from '@/components/auth/sign-in-required';
import { EditAdvertisementForm } from '@/components/my-ads/edit-form';
import { SetupNotice } from '@/components/setup-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { EmptyState } from '@/components/ui/states';
import { getCurrentUser } from '@/lib/auth/session';
import { getMyAdvertisement, STATUS_COPY } from '@/lib/data/my-ads';
import { isSupabaseConfigured } from '@/lib/env';
import { isEditable } from '@/lib/post-ad/edit';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Edit your advertisement',
  robots: { index: false, follow: false },
};

/**
 * Correcting one of your own advertisements.
 *
 * Whether it is yours is decided by `owner_ads`, which filters on
 * `user_id = auth.uid()` inside the database: an id belonging to somebody else
 * simply returns nothing, and this page shows the same "not found" it would
 * show for an id that does not exist. That is deliberate — telling a stranger
 * "this exists but is not yours" is telling them it exists.
 */
export default async function EditAdvertisementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
        <SignInRequired next={`/my-ads/${id}/edit`} />
      </Container>
    );
  }

  const advertisement = await getMyAdvertisement(id);

  if (!advertisement) {
    return (
      <Container className="py-16">
        <EmptyState
          title="We could not find that advertisement"
          description="It may have been removed, or the link may be wrong."
          action={{ label: 'My advertisements', href: '/my-ads' }}
        />
      </Container>
    );
  }

  if (!isEditable(advertisement.status)) {
    return (
      <Container className="py-16">
        <EmptyState
          title="This one has finished its run"
          description="Editing it here would not bring it back. Our office can start it again for you — the reference is on your list."
          action={{ label: 'My advertisements', href: '/my-ads' }}
        />
      </Container>
    );
  }

  const status = STATUS_COPY[advertisement.status];

  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm">
          <Link href="/my-ads" className="text-fg-muted underline-offset-4 hover:underline">
            ← My advertisements
          </Link>
        </p>

        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="font-mono text-xs text-fg-subtle">{advertisement.reference}</span>
          </div>
          <h1 className="mt-2 font-serif text-3xl leading-tight font-semibold">
            Edit your advertisement
          </h1>
        </header>

        <div className="mt-8">
          <EditAdvertisementForm advertisement={advertisement} />
        </div>

        {advertisement.kind === 'display' ? (
          <p className="mt-8 rounded-sm border border-line bg-surface-sunken p-3 text-xs text-fg-muted">
            Artwork cannot be changed here yet. To send a new file, reply to the email from our
            advertising team or{' '}
            <Button
              href={`tel:+91${SITE.phones[0]}`}
              variant="ghost"
              size="sm"
              className="px-1"
            >
              call the office on {SITE.phones[0]}
            </Button>
            .
          </p>
        ) : null}
      </div>
    </Container>
  );
}
