import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { CategoryIcon, MapPinIcon } from '@/components/ui/icons';
import { CATEGORY_BY_SLUG } from '@/config/categories';
import { cardFields, PRICE_LABEL, priceRole } from '@/config/category-fields';
import { locationName } from '@/config/locations';
import { formatPrice, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Advertisement } from '@/types/content';

/**
 * Listing card, shared by the homepage and the browsing pages.
 *
 * Which details appear is decided per category by `config/category-fields`,
 * not by this component: a property advertisement shows type and area, a job
 * shows employer and experience, a matrimonial notice shows neither and no
 * price at all. A field absent from the data is simply not rendered, so no
 * category is forced to carry a blank row.
 *
 * Variants:
 *  - `full`     image panel, used in grids
 *  - `compact`  no image, denser, used in the homepage list
 *  - `row`      horizontal, used in the browsing list view on wide screens
 */
export type AdvertisementCardVariant = 'full' | 'compact' | 'row';

export function AdvertisementCard({
  advertisement,
  variant = 'full',
  showReference = false,
}: {
  advertisement: Advertisement;
  variant?: AdvertisementCardVariant;
  showReference?: boolean;
}) {
  const category = CATEGORY_BY_SLUG.get(advertisement.categorySlug);
  const href = `/classifieds/${advertisement.slug}`;
  const role = priceRole(advertisement.categorySlug);
  const showPrice = role !== 'none';

  const details = cardFields(advertisement.categorySlug)
    .map((field) => ({ ...field, value: advertisement.attributes[field.key] }))
    .filter((field) => field.value !== undefined && field.value !== '')
    .slice(0, variant === 'compact' ? 2 : 4);

  const isRow = variant === 'row';
  const showImage = variant === 'full';

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-md border bg-surface transition-colors',
        isRow ? 'flex flex-col sm:flex-row' : 'flex h-full flex-col',
        advertisement.isFeatured
          ? 'border-accent-line hover:border-gold-400'
          : 'border-line hover:border-line-strong',
      )}
    >
      {showImage ? (
        <div className="relative aspect-4/3 overflow-hidden border-b border-line bg-surface-sunken">
          <ImagePanel advertisement={advertisement} categoryName={category?.name} />
          {advertisement.isFeatured ? (
            <div className="absolute top-2.5 left-2.5">
              <Badge tone="featured">Featured</Badge>
            </div>
          ) : null}
        </div>
      ) : null}

      {isRow ? (
        <div className="relative w-full shrink-0 border-b border-line bg-surface-sunken sm:w-52 sm:border-r sm:border-b-0">
          <div className="aspect-4/3 sm:h-full">
            <ImagePanel advertisement={advertisement} categoryName={category?.name} />
          </div>
          {advertisement.isFeatured ? (
            <div className="absolute top-2.5 left-2.5">
              <Badge tone="featured">Featured</Badge>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={cn('flex flex-1 flex-col', variant === 'compact' ? 'p-4' : 'p-5')}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {category ? (
            <Link
              href={`/classifieds/${category.slug}`}
              className="relative z-10 font-semibold tracking-[0.1em] text-primary uppercase hover:underline"
            >
              {category.name}
            </Link>
          ) : null}
          {!showImage && !isRow && advertisement.isFeatured ? (
            <Badge tone="featured">Featured</Badge>
          ) : null}
        </div>

        <h3 className="mt-2 font-serif text-lg leading-snug font-semibold">
          <Link href={href} className="before:absolute before:inset-0">
            <span className="line-clamp-2-safe">{advertisement.title}</span>
          </Link>
        </h3>

        <p className="mt-2 line-clamp-2-safe text-sm leading-relaxed text-fg-muted">
          {advertisement.summary}
        </p>

        {details.length > 0 ? (
          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {details.map((field) => (
              <div key={field.key} className="flex gap-1.5">
                <dt className="text-fg-subtle">{field.label}:</dt>
                <dd className="font-medium text-fg">
                  {field.key === 'areaSqft' ? `${field.value} sq.ft.` : field.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {showPrice ? (
          <p className="mt-3 text-lg font-semibold text-fg">
            {formatPrice(advertisement.price, advertisement.priceType)}
            {role === 'salary' && advertisement.price !== null ? (
              <span className="ml-1 text-xs font-normal text-fg-subtle">
                {PRICE_LABEL[role].toLowerCase()} per month
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-fg-subtle">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPinIcon size={13} />
            <span className="truncate">{locationName(advertisement.locationSlug)}</span>
          </span>
          <span className="flex items-center gap-3">
            {showReference ? (
              <span className="tabular-nums">{advertisement.reference}</span>
            ) : null}
            <time dateTime={advertisement.publishedAt}>
              {formatRelative(advertisement.publishedAt)}
            </time>
          </span>
        </div>

        {variant !== 'compact' ? (
          <span
            aria-hidden="true"
            className={cn(
              'mt-4 inline-flex items-center justify-center rounded-sm border border-line-strong px-4 py-2 text-sm font-medium transition-colors group-hover:border-primary group-hover:text-primary',
              isRow && 'sm:mt-auto sm:self-start',
            )}
          >
            View Advertisement
          </span>
        ) : null}
      </div>
    </article>
  );
}

/**
 * No photograph yet. A typographic panel is shown rather than a stock image,
 * so nothing on the page pretends to be a real advertiser's picture.
 */
function ImagePanel({
  advertisement,
  categoryName,
}: {
  advertisement: Advertisement;
  categoryName: string | undefined;
}) {
  const cover = advertisement.images[0];

  if (cover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- sized at upload time
      <img
        src={cover}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
    );
  }

  const category = CATEGORY_BY_SLUG.get(advertisement.categorySlug);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 px-4 text-center text-fg-subtle">
      <CategoryIcon name={category?.icon ?? 'tag'} size={26} />
      <span className="font-serif text-lg leading-tight">
        {categoryName ?? 'Advertisement'}
      </span>
    </div>
  );
}
