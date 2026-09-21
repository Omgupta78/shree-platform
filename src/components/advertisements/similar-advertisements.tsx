import Link from 'next/link';

import { AdvertisementCard } from '@/components/advertisements/advertisement-card';
import { ArrowRightIcon } from '@/components/ui/icons';
import type { Advertisement } from '@/types/content';

/**
 * Related advertisements, chosen by `lib/classifieds/similar.ts`. Renders
 * nothing at all when there is no good match — an empty band with a heading
 * would just be noise.
 */
export function SimilarAdvertisements({
  advertisements,
  categorySlug,
  categoryName,
}: {
  advertisements: readonly Advertisement[];
  categorySlug: string;
  categoryName: string;
}) {
  if (advertisements.length === 0) return null;

  return (
    <section aria-labelledby="similar-heading" className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-fg pb-3">
        <h2 id="similar-heading" className="font-serif text-2xl font-semibold">
          Similar advertisements
        </h2>
        <Link
          href={`/classifieds/${categorySlug}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          All in {categoryName}
          <ArrowRightIcon size={15} />
        </Link>
      </div>

      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {advertisements.map((advertisement) => (
          <li key={advertisement.id}>
            <AdvertisementCard advertisement={advertisement} />
          </li>
        ))}
      </ul>
    </section>
  );
}
