import type { Metadata } from 'next';

import { PostAdPage } from '@/components/post-ad/post-ad-page';
import { getPackageConfigs } from '@/lib/data/packages';

export const metadata: Metadata = {
  title: 'Post Your Advertisement',
  description:
    'Book a classified or display advertisement with Shree Classified for Roorkee and Haridwar district.',
  alternates: { canonical: '/post-ad' },
  // A half-written form is not a page worth ranking, and it holds nothing a
  // search engine can usefully show. The advertising information page, when
  // it exists, is the one that should be indexed.
  robots: { index: false, follow: true },
};

/**
 * The packages are read here, on the server, and handed to the form.
 *
 * Their prices, run lengths and image limits are rows in the database, so the
 * office changes what Standard costs with an UPDATE rather than a deployment.
 * The form sends back a package id and nothing else; what that package costs
 * is read from the same table again when the order is raised.
 */
export default async function Page() {
  const packages = await getPackageConfigs();
  return <PostAdPage packages={packages} />;
}
