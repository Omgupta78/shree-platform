import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ClassifiedsBrowser } from '@/components/classifieds/classifieds-browser';
import { JsonLd, itemListSchema } from '@/lib/seo/jsonld';
import { CATEGORY_BY_SLUG } from '@/config/categories';
import { LOCATION_BY_SLUG } from '@/config/locations';
import { SITE } from '@/config/site';
import { parseAdQuery, type RawSearchParams } from '@/lib/classifieds/query';
import { queryAdvertisements } from '@/lib/data/classifieds-repository';
import { siteUrl } from '@/lib/env';
import { LANDING_MINIMUM_ADS, countForPair, isKnownPair, siblingLandings } from '@/lib/seo/landings';
import { listingIndexing } from '@/lib/seo/listing';
import { publicMetadata } from '@/lib/seo/metadata';

/**
 * A section, in one place. "Property in Manglaur".
 *
 * These are the only location pages that exist, and they are not generated
 * from a loop over every category and every town. That would be eighty-one
 * URLs, most of them empty — thin pages, which is the one thing the brief is
 * most explicit about not making. A pair earns its page by having
 * advertisements in it; the threshold and the reasoning are in
 * `lib/seo/landings.ts`.
 *
 * A pair below the threshold is NOT a 404. The page renders, with whatever is
 * genuinely there, because somebody may have followed a link or filtered their
 * way here and an error would be a lie — there simply is not enough on it to
 * ask a search engine to rank, so it says `noindex` and stays out of the
 * sitemap. Only a slug that is not a real category or a real place is a
 * genuine 404.
 *
 * Nothing is prerendered. Which pairs are worth a page changes as
 * advertisements are published and expire, and a list baked at deploy time
 * would keep offering a page that emptied in March.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; location: string }>;
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const { slug, location } = await params;
  const category = CATEGORY_BY_SLUG.get(slug);
  const place = LOCATION_BY_SLUG.get(location);

  if (!category || !place || !isKnownPair(slug, location)) {
    return { title: 'Not found', robots: { index: false, follow: false } };
  }

  const raw = await searchParams;
  const query = parseAdQuery({ ...raw, location }, slug);
  const basePath = `/classifieds/${slug}/${location}`;
  const policy = listingIndexing(basePath, query, raw);

  // Two independent reasons not to index, and both must be satisfied to
  // index: enough advertisements to be worth a page, and a view the visitor
  // did not narrow themselves.
  const count = await countForPair(slug, location);
  const index = policy.index && count >= LANDING_MINIMUM_ADS;

  return publicMetadata({
    title:
      query.page > 1
        ? `${category.name} in ${place.name} — page ${query.page}`
        : `${category.name} in ${place.name}`,
    description: `${category.description} Advertisements placed for ${place.name}, published by ${SITE.name} in print and online.`,
    path: policy.canonicalPath,
    index,
  });
}

export default async function LocationLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; location: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { slug, location } = await params;

  if (!isKnownPair(slug, location)) notFound();

  const category = CATEGORY_BY_SLUG.get(slug);
  const place = LOCATION_BY_SLUG.get(location);
  if (!category || !place) notFound();

  const raw = await searchParams;
  // The place is fixed by the URL rather than taken from the query string, so
  // `/classifieds/jobs/roorkee?location=haridwar` cannot show Haridwar
  // advertisements under a Roorkee heading.
  const query = parseAdQuery({ ...raw, location }, slug);

  const [results, siblings] = await Promise.all([
    queryAdvertisements(query),
    siblingLandings(slug, location),
  ]);

  const base = siteUrl();
  const path = `/classifieds/${slug}/${location}`;

  return (
    <>
      <ClassifiedsBrowser
        query={query}
        category={category}
        place={place}
        baseUrl={base}
        intro={`${category.description} These are the ones placed for ${place.name}.`}
        belowResults={
          siblings.length > 0 ? (
            <nav aria-label={`${category.name} in other places`} className="mt-10">
              <h2 className="font-serif text-lg font-semibold">
                {category.name} in other places
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {siblings.map((sibling) => (
                  <li key={sibling.path}>
                    <Link
                      href={sibling.path}
                      className="inline-flex items-center rounded-full border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-sunken"
                    >
                      {/*
                        The anchor text says what is at the other end rather
                        than "click here": it is the whole of what a link
                        tells a reader before they follow it.
                      */}
                      {category.name} in {sibling.locationName}
                      <span className="ml-1.5 text-fg-subtle tabular-nums">{sibling.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null
        }
      />

      {/*
        A table of contents for this page's advertisements — positions and
        URLs only. The advertisements' own details are marked up on their own
        pages, where they cannot fall out of step with what is shown.
      */}
      {results.items.length > 0 ? (
        <JsonLd
          data={itemListSchema({
            name: `${category.name} in ${place.name}`,
            path,
            urls: results.items.map((ad) => `/classifieds/${ad.slug}`),
          })}
        />
      ) : null}
    </>
  );
}
