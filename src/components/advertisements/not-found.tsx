import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { SearchIcon } from '@/components/ui/icons';

/**
 * Shown when a slug matches no publicly visible advertisement — either it
 * never existed, or it has expired, been withdrawn or not yet been approved.
 * The copy avoids saying which, since that would leak the state of
 * advertisements that are not public.
 */
export function AdvertisementNotFound({ slug }: { slug?: string }) {
  return (
    <Container className="flex flex-col items-center py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-sunken text-fg-subtle">
        <SearchIcon size={28} />
      </span>

      <h1 className="mt-6 font-serif text-3xl font-semibold">Advertisement Not Found</h1>
      <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-fg-muted">
        We could not find this advertisement. It may have expired, been withdrawn, or the
        link may be incorrect.
      </p>

      {slug ? (
        <p className="mt-3 max-w-md text-xs break-all text-fg-subtle">/classifieds/{slug}</p>
      ) : null}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/classifieds">Browse Classifieds</Button>
        <Button href="/" variant="secondary">
          Back to home
        </Button>
      </div>
    </Container>
  );
}
