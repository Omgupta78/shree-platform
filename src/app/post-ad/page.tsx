import type { Metadata } from 'next';

import { PostAdPage } from '@/components/post-ad/post-ad-page';

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

export default function Page() {
  return <PostAdPage />;
}
