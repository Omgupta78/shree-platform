import Link from 'next/link';

import { CATEGORY_BY_SLUG } from '@/config/categories';
import { cardFields, PRICE_LABEL, priceRole } from '@/config/category-fields';
import { locationName } from '@/config/locations';
import { formatDate, formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Advertisement } from '@/types/content';

interface Row {
  label: string;
  value: React.ReactNode;
}

/**
 * The structured information grid.
 *
 * Rows are assembled first and empty ones dropped, so the page never shows a
 * label with a dash beside it. A matrimonial notice simply has no price row; a
 * property advertisement gains rows for area and bedrooms that a vacancy does
 * not have.
 */
export function AdvertisementMeta({ advertisement }: { advertisement: Advertisement }) {
  const category = CATEGORY_BY_SLUG.get(advertisement.categorySlug);
  const role = priceRole(advertisement.categorySlug);

  const rows: Row[] = [];

  if (category) {
    rows.push({
      label: 'Category',
      value: (
        <Link href={`/classifieds/${category.slug}`} className="hover:text-primary">
          {category.name}
        </Link>
      ),
    });
  }

  rows.push({ label: 'Location', value: locationName(advertisement.locationSlug) });

  if (role !== 'none') {
    rows.push({
      label: PRICE_LABEL[role],
      value: formatPrice(advertisement.price, advertisement.priceType),
    });
  }

  // Category-specific attributes, using the same labels as the listing cards.
  for (const field of cardFields(advertisement.categorySlug)) {
    const value = advertisement.attributes[field.key];
    if (value === undefined || value === '') continue;
    rows.push({
      label: field.label,
      value: field.key === 'areaSqft' ? `${value} sq.ft.` : String(value),
    });
  }

  rows.push({
    label: 'Posted',
    value: (
      <time dateTime={advertisement.publishedAt}>{formatDate(advertisement.publishedAt)}</time>
    ),
  });

  if (advertisement.updatedAt) {
    rows.push({
      label: 'Updated',
      value: (
        <time dateTime={advertisement.updatedAt}>{formatDate(advertisement.updatedAt)}</time>
      ),
    });
  }

  if (advertisement.expiresAt) {
    rows.push({
      label: 'Listed until',
      value: (
        <time dateTime={advertisement.expiresAt}>{formatDate(advertisement.expiresAt)}</time>
      ),
    });
  }

  rows.push({
    label: 'Advertisement ID',
    value: <span className="tabular-nums">{advertisement.reference}</span>,
  });

  return (
    <section aria-labelledby="details-heading">
      <h2 id="details-heading" className="font-serif text-xl font-semibold">
        Advertisement details
      </h2>

      <dl className="mt-4 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={cn(
              'bg-surface px-4 py-3',
              // An odd number of rows would otherwise leave a bare grey cell
              // at the end of the grid; the last one spans instead.
              index === rows.length - 1 && rows.length % 2 === 1 && 'sm:col-span-2',
            )}
          >
            <dt className="text-xs font-semibold tracking-[0.1em] text-fg-subtle uppercase">
              {row.label}
            </dt>
            <dd className="mt-1 text-[0.9375rem] text-fg">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
