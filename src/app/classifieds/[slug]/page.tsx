import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AdvertisementDetails } from '@/components/advertisements/advertisement-details';
import { AdvertisementDetailsSkeleton } from '@/components/advertisements/details-skeleton';
import { AdvertisementExpired } from '@/components/advertisements/expired';
import { AdvertisementNotFound } from '@/components/advertisements/not-found';
import {
  OwnerAdvertisementPanel,
  ownerExpiredContext,
} from '@/components/lifecycle/owner-advertisement-panel';
import { ClassifiedsBrowser } from '@/components/classifieds/classifieds-browser';
import Link from 'next/link';

import { CATEGORIES, CATEGORY_BY_SLUG, type Category } from '@/config/categories';
import { SITE } from '@/config/site';
import { parseAdQuery, type RawSearchParams } from '@/lib/classifieds/query';
import {
  getAdvertisementBySlug,
  getExpiredAdvertisement,
  getLatestAdvertisements,
  getSimilarAdvertisements,
  queryAdvertisements,
} from '@/lib/data/classifieds-repository';
import { locationName } from '@/config/locations';
import { siteUrl } from '@/lib/env';
import { JsonLd, itemListSchema } from '@/lib/seo/jsonld';
import { liveLocationLandings } from '@/lib/seo/landings';
import { listingIndexing } from '@/lib/seo/listing';
import { metaDescription, publicMetadata } from '@/lib/seo/metadata';
import type { Advertisement } from '@/types/content';

/**
 * One dynamic segment serves two kinds of page.
 *
 * `/classifieds/property` is a category; `/classifieds/2-bhk-flat-for-rent` is
 * an advertisement. Next.js allows only one dynamic segment per level, so the
 * slug is resolved here: categories are a fixed known set and win, anything
 * else is looked up as an advertisement. Advertisement slugs are generated
 * from titles and are checked against the category slugs, so the two cannot
 * collide.
 */
/**
 * Only the categories are prerendered.
 *
 * Advertisements are not, and deliberately: an advertisement can be rejected,
 * withdrawn or reach its expiry at any moment, and a page built at deploy time
 * would keep showing it until the next deploy. The visibility rule lives in
 * `public_ads` and is evaluated per request, so the page is rendered on demand
 * and is correct the moment the row changes. Categories are a fixed set that
 * only a migration changes, so prerendering them costs nothing and is never
 * stale.
 */
export async function generateStaticParams() {
  return CATEGORIES.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const { slug } = await params;

  const category = CATEGORY_BY_SLUG.get(slug);
  if (category) {
    // A section is also every filtered, sorted and paged view of itself.
    // `listingIndexing` decides which of those asks to be ranked.
    const raw = await searchParams;
    const query = parseAdQuery(raw, category.slug);
    const { canonicalPath, index } = listingIndexing(`/classifieds/${category.slug}`, query, raw);

    return publicMetadata({
      title:
        query.page > 1 ? `${category.name} — page ${query.page}` : category.name,
      description: `${category.description} Placed with ${SITE.name} across ${SITE.city} and Haridwar district.`,
      path: canonicalPath,
      index,
    });
  }

  const advertisement = await getAdvertisementBySlug(slug);
  if (!advertisement) {
    // Not indexable: either it does not exist, or it is not publicly visible.
    // An expired one says so, and says nothing that would read as available.
    const expired = await getExpiredAdvertisement(slug);
    if (expired) {
      return publicMetadata({
        title: 'Advertisement expired',
        description: `This advertisement is no longer active. Browse current ${expired.categoryName ?? 'classified'} advertisements on ${SITE.name}.`,
        path: `/classifieds/${slug}`,
        // Not indexed, but followed: the links out of this page lead to
        // advertisements that ARE current, and those should still be crawled.
        index: false,
      });
    }
    return { title: 'Advertisement not found', robots: { index: false, follow: false } };
  }

  const place = locationName(advertisement.locationSlug);
  /*
   * "2 BHK flat for rent in Roorkee" — what the advertisement is, and where.
   * The place is what makes a classified findable: somebody searching is
   * nearly always searching locally, and a title without a town competes with
   * every identical item in the country.
   *
   * Nothing private goes in. The advertiser's name, telephone number, WhatsApp
   * number and email are all on the page behind a consent check, and none of
   * them appears in the title, the description or the share card — a social
   * preview is copied and forwarded by people who never opened the page.
   */
  const title = `${advertisement.title} in ${place}`;
  const description = metaDescription(advertisement.summary);

  return publicMetadata({
    title,
    description,
    path: `/classifieds/${advertisement.slug}`,
    type: 'article',
    // `getAdvertisementBySlug` returns null for anything not approved and
    // unexpired, so a pending, rejected or finished advertisement never
    // reaches this branch and never gets an indexable page.
    index: true,
    images: advertisement.images,
    imageAlt: imageAltText(advertisement, 0),
  });
}

/**
 * Alternative text for one of an advertisement's photographs.
 *
 * Says what the picture is of and where it is — "2 BHK flat for rent in
 * Roorkee" — rather than repeating a keyword list. Where there are several,
 * the position is added so a screen-reader user can tell them apart.
 *
 * The advertiser's own words are used as written. Appending terms they did not
 * choose would be keyword stuffing carried out on their behalf.
 */
export function imageAltText(advertisement: Advertisement, index: number): string {
  const place = locationName(advertisement.locationSlug);
  const subject = `${advertisement.title} in ${place}`;
  const count = advertisement.images.length;
  if (count <= 1) return subject;
  return `${subject} — photograph ${index + 1} of ${count}`;
}

export default async function ClassifiedsSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { slug } = await params;
  const category = CATEGORY_BY_SLUG.get(slug);

  if (category) {
    const query = parseAdQuery(await searchParams, category.slug);
    return <CategorySection category={category} query={query} />;
  }

  return (
    <Suspense fallback={<AdvertisementDetailsSkeleton />}>
      <AdvertisementRoute slug={slug} />
    </Suspense>
  );
}

/**
 * One section, with the places it is currently running in linked underneath.
 *
 * The links are the internal linking this phase is largely about: a reader —
 * and a crawler — reaches "Property in Manglaur" from the property section,
 * rather than that page existing with nothing pointing at it. Only pairs with
 * genuine inventory are listed, so the section never links to an empty page.
 */
async function CategorySection({
  category,
  query,
}: {
  category: Category;
  query: ReturnType<typeof parseAdQuery>;
}) {
  const base = siteUrl();
  const [results, landings] = await Promise.all([
    queryAdvertisements(query),
    liveLocationLandings(),
  ]);
  const places = landings.filter((l) => l.categorySlug === category.slug);

  return (
    <>
      <ClassifiedsBrowser
        query={query}
        category={category}
        baseUrl={base}
        belowResults={
          places.length > 0 ? (
            <nav aria-label={`${category.name} by place`} className="mt-10">
              <h2 className="font-serif text-lg font-semibold">
                {category.name} by place
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                Places where this section currently has advertisements running.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {places.map((landing) => (
                  <li key={landing.path}>
                    <Link
                      href={landing.path}
                      className="inline-flex items-center rounded-full border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-sunken"
                    >
                      {category.name} in {landing.locationName}
                      <span className="ml-1.5 text-fg-subtle tabular-nums">{landing.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null
        }
      />

      {results.items.length > 0 ? (
        <JsonLd
          data={itemListSchema({
            name: category.name,
            path: `/classifieds/${category.slug}`,
            urls: results.items.map((ad) => `/classifieds/${ad.slug}`),
          })}
        />
      ) : null}
    </>
  );
}

async function AdvertisementRoute({ slug }: { slug: string }) {
  const advertisement = await getAdvertisementBySlug(slug);

  // A plain rendered state rather than `notFound()`: Next.js 16.3.5 answers
  // 200 for `notFound()` in a route that reads searchParams, so the styled
  // page below is what a visitor gets either way, and this keeps the copy and
  // the actions the brief asked for.
  if (!advertisement) {
    const expired = await getExpiredAdvertisement(slug);
    if (!expired) return <AdvertisementNotFound slug={slug} />;
    // Recommendations come from the live listing only — the same query layer
    // as every other public list — so an expired advertisement is never
    // offered as "similar" to another.
    const [similar, owner] = await Promise.all([
      getLatestAdvertisements(4, expired.categorySlug ?? undefined),
      ownerExpiredContext(slug),
    ]);
    return <AdvertisementExpired stub={expired} similar={similar} owner={owner} />;
  }

  const similar = await getSimilarAdvertisements(advertisement);

  return (
    <>
      <OwnerAdvertisementPanel slug={slug} />
      <AdvertisementDetails
        advertisement={advertisement}
        similar={similar}
        baseUrl={siteUrl()}
      />
      <AdvertisementJsonLd advertisement={advertisement} />
    </>
  );
}

/**
 * Structured data.
 *
 * Only fields the advertisement actually carries are emitted. No rating, no
 * seller rating, no availability date and no brand are invented. An
 * advertisement with no price gets no `offers` block at all rather than one
 * with a zero in it.
 */
function AdvertisementJsonLd({ advertisement }: { advertisement: Advertisement }) {
  const base = siteUrl();
  const hasPrice =
    advertisement.price !== null &&
    (advertisement.priceType === 'fixed' || advertisement.priceType === 'negotiable');

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: advertisement.title,
    description: advertisement.summary,
    sku: advertisement.reference,
    url: `${base}/classifieds/${advertisement.slug}`,
    category: CATEGORY_BY_SLUG.get(advertisement.categorySlug)?.name,
  };

  if (advertisement.images.length) {
    data.image = advertisement.images.map((image) => `${base}${image}`);
  }

  if (hasPrice) {
    data.offers = {
      '@type': 'Offer',
      price: advertisement.price,
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      url: `${base}/classifieds/${advertisement.slug}`,
      areaServed: locationName(advertisement.locationSlug),
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
