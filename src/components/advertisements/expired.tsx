import { AdvertisementCard } from '@/components/advertisements/advertisement-card';
import { ExpiryNotice } from '@/components/lifecycle/expiry-notice';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { ClockIcon } from '@/components/ui/icons';
import type { ExpiryState } from '@/lib/lifecycle/expiry';
import type { ExpiredAdvertisementStub } from '@/lib/data/classifieds-repository';
import type { Advertisement } from '@/types/content';

/**
 * What a visitor sees at the URL of an advertisement whose run has ended.
 *
 * Not the advertisement: no description, no price, no contact details — those
 * belonged to a listing that is no longer active. The title and section are
 * enough to say what it was and to offer live advertisements like it. The
 * owner, and only the owner, also sees when it ended and a way to renew.
 */
export function AdvertisementExpired({
  stub,
  similar,
  owner,
}: {
  stub: ExpiredAdvertisementStub;
  similar: Advertisement[];
  owner: { advertisementId: string; state: ExpiryState; hasPendingRenewal: boolean } | null;
}) {
  return (
    <Container className="py-16 sm:py-20">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-sunken text-fg-subtle">
          <ClockIcon size={28} />
        </span>
        <h1 className="mt-6 font-serif text-3xl font-semibold">Advertisement Expired</h1>
        <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-fg-muted">
          This advertisement is no longer active.
        </p>
        <p className="mt-2 max-w-md text-sm text-fg-subtle">{stub.title}</p>

        {owner ? (
          <ExpiryNotice
            className="mt-6 w-full max-w-xl text-left"
            state={owner.state}
            advertisementId={owner.advertisementId}
            hasPendingRenewal={owner.hasPendingRenewal}
          />
        ) : null}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href={stub.categorySlug ? `/classifieds/${stub.categorySlug}` : '/classifieds'}>
            Browse Classifieds
          </Button>
        </div>
      </div>

      {similar.length ? (
        <section aria-labelledby="similar" className="mt-16">
          <h2 id="similar" className="font-serif text-2xl font-semibold">
            Looking for something similar?
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((advertisement) => (
              <li key={advertisement.id}>
                <AdvertisementCard advertisement={advertisement} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Container>
  );
}
