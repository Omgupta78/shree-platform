import { AdvertisementCard } from '@/components/advertisements/advertisement-card';
import type { Advertisement } from '@/types/content';

/**
 * Results grid. A plain list of cards — the only decision here is how many
 * columns, which the results toolbar's view toggle sets.
 */
export function AdvertisementGrid({
  advertisements,
}: {
  advertisements: readonly Advertisement[];
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {advertisements.map((advertisement) => (
        <li key={advertisement.id}>
          <AdvertisementCard advertisement={advertisement} showReference />
        </li>
      ))}
    </ul>
  );
}

/** The same results as full-width rows, which suits text-led classifieds. */
export function AdvertisementList({
  advertisements,
}: {
  advertisements: readonly Advertisement[];
}) {
  return (
    <ul className="space-y-4">
      {advertisements.map((advertisement) => (
        <li key={advertisement.id}>
          <AdvertisementCard advertisement={advertisement} variant="row" showReference />
        </li>
      ))}
    </ul>
  );
}
