import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/seo/metadata';

import { PostAdPage } from '@/components/post-ad/post-ad-page';
import { getPackageConfigs } from '@/lib/data/packages';

/*
 * Not indexed. A half-written form holds nothing a search engine can usefully
 * show, and `/advertise` is the page that explains the same thing to somebody
 * arriving from a search. `follow` stays on so the links out of it still count.
 */
export const metadata: Metadata = publicMetadata({
  title: 'Post Your Advertisement',
  description:
    'Book a classified or display advertisement with Shree Classified for Roorkee and Haridwar district.',
  path: '/post-ad',
  index: false,
});

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
