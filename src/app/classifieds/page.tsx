import type { Metadata } from 'next';

import { ClassifiedsBrowser } from '@/components/classifieds/classifieds-browser';
import { SITE } from '@/config/site';
import { parseAdQuery, type RawSearchParams } from '@/lib/classifieds/query';

export const metadata: Metadata = {
  title: 'Classifieds',
  description: `Browse local classified advertisements for jobs, property, education, vehicles and services across ${SITE.city} and Haridwar district.`,
  alternates: { canonical: '/classifieds' },
};

export default async function ClassifiedsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const query = parseAdQuery(await searchParams, null);
  return <ClassifiedsBrowser query={query} category={null} />;
}
