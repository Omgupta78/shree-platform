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
import { CATEGORIES, CATEGORY_BY_SLUG } from '@/config/categories';
import { SITE } from '@/config/site';
import { parseAdQuery, type RawSearchParams } from '@/lib/classifieds/query';
import {
  getAdvertisementBySlug,
  getExpiredAdvertisement,
  getLatestAdvertisements,
  getSimilarAdvertisements,
} from '@/lib/data/classifieds-repository';
import { locationName } from '@/config/locations';
import { siteUrl } from '@/lib/env';
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
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const category = CATEGORY_BY_SLUG.get(slug);
  if (category) {
    return {
      title: category.name,
      description: category.description,
      alternates: { canonical: `/classifieds/${category.slug}` },
    };
  }

  const advertisement = await getAdvertisementBySlug(slug);
  if (!advertisement) {
    // Not indexable: either it does not exist, or it is not publicly visible.
    // An expired one says so, and says nothing that would read as available.
    const expired = await getExpiredAdvertisement(slug);
    if (expired) {
      return {
        title: 'Advertisement expired',
        description: `This advertisement is no longer active. Browse current ${expired.categoryName ?? 'classified'} advertisements on ${SITE.name}.`,
        robots: { index: false, follow: true },
      };
    }
    return { title: 'Advertisement not found', robots: { index: false, follow: true } };
  }

  const place = locationName(advertisement.locationSlug);
  const title = `${advertisement.title} in ${place}`;
  const description = advertisement.summary.slice(0, 200);
  const canonical = `/classifieds/${advertisement.slug}`;
  const images = advertisement.images.map((image) => `${siteUrl()}${image}`);

  return {
    title,
    description,
    alternates: { canonical },
    // `getAdvertisementBySlug` returns null for anything not approved, so a
    // pending, rejected or expired advertisement never reaches this branch and
    // never gets an indexable page.
    robots: { index: true, follow: true },
    openGraph: {
      type: 'article',
      title: `${title} | ${SITE.name}`,
      description,
      url: `${siteUrl()}${canonical}`,
      siteName: SITE.name,
      locale: 'en_IN',
      ...(images.length ? { images } : {}),
    },
  };
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
    return <ClassifiedsBrowser query={query} category={category} />;
  }

  return (
    <Suspense fallback={<AdvertisementDetailsSkeleton />}>
      <AdvertisementRoute slug={slug} />
    </Suspense>
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
