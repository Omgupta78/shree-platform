import { MapPinIcon } from '@/components/ui/icons';
import { locationName } from '@/config/locations';
import { formatDate } from '@/lib/format';
import type { Advertisement } from '@/types/content';

/**
 * About the advertiser.
 *
 * Deliberately sparse. No rating, no review count, no "verified" badge and no
 * response-time figure: the platform measures none of those things, and a
 * trust signal the system cannot back up is worse than none at all. Only the
 * name, the area, and — where known — how long they have been advertising.
 */
export function AdvertiserCard({ advertisement }: { advertisement: Advertisement }) {
  const initial = advertisement.contactName.trim().charAt(0).toUpperCase() || '?';

  return (
    <section aria-labelledby="advertiser-heading">
      <h2 id="advertiser-heading" className="font-serif text-xl font-semibold">
        About the advertiser
      </h2>

      <div className="mt-4 flex items-start gap-4 rounded-md border border-line bg-surface p-5">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-sunken font-serif text-xl font-semibold text-fg-muted"
        >
          {initial}
        </span>

        <div className="min-w-0">
          <p className="font-serif text-lg leading-tight font-semibold">
            {advertisement.contactName}
          </p>

          <dl className="mt-2 space-y-1 text-sm text-fg-muted">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Location</dt>
              <MapPinIcon size={14} />
              <dd>{locationName(advertisement.locationSlug)}</dd>
            </div>

            {advertisement.advertiserSince ? (
              <div>
                <dt className="sr-only">Advertising since</dt>
                <dd>
                  Advertising with us since{' '}
                  <time dateTime={advertisement.advertiserSince}>
                    {formatDate(advertisement.advertiserSince)}
                  </time>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </section>
  );
}
