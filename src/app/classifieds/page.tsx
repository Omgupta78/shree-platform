import type { Metadata } from 'next';

import { ClassifiedsBrowser } from '@/components/classifieds/classifieds-browser';
import { SITE } from '@/config/site';
import { parseAdQuery, type RawSearchParams } from '@/lib/classifieds/query';
import { listingIndexing } from '@/lib/seo/listing';
import { publicMetadata } from '@/lib/seo/metadata';

/**
 * Every section, unfiltered.
 *
 * The metadata is generated rather than fixed because this one URL is also
 * every filtered, sorted and paged view of itself. `listingIndexing` decides
 * which of those asks to be ranked and where each one's canonical points; the
 * reasoning is in `lib/seo/listing.ts`.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const raw = await searchParams;
  const query = parseAdQuery(raw, null);
  const { canonicalPath, index } = listingIndexing('/classifieds', query, raw);

  return publicMetadata({
    title: query.page > 1 ? `Classifieds — page ${query.page}` : 'Classifieds',
    description: `Browse local classified advertisements for jobs, property, education, vehicles and services across ${SITE.city} and Haridwar district.`,
    path: canonicalPath,
    index,
  });
}

export default async function ClassifiedsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const query = parseAdQuery(await searchParams, null);
  return <ClassifiedsBrowser query={query} category={null} />;
}
