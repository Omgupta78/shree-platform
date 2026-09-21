import type { Metadata } from 'next';

import { AdvertisementTypes } from '@/components/home/advertisement-types';
import { BusinessAdvertisingSection } from '@/components/home/business-advertising-section';
import { BusinessInfoSection } from '@/components/home/business-info-section';
import { CategoryGrid } from '@/components/home/category-grid';
import { FeaturedAds } from '@/components/home/featured-ads';
import { Hero } from '@/components/home/hero';
import { LatestClassifieds } from '@/components/home/latest-classifieds';
import { PrintDigitalSection } from '@/components/home/print-digital-section';
import { TodaysEdition } from '@/components/home/todays-edition';
import { SITE } from '@/config/site';
import {
  getFeaturedAdvertisements,
  getLatestAdvertisements,
} from '@/lib/data/classifieds-repository';
import { CURRENT_EDITION, PREVIOUS_EDITIONS } from '@/lib/mock/editions';

export const metadata: Metadata = {
  title: `${SITE.name} | Local Classified & Advertising Platform in ${SITE.city}`,
  description:
    'Browse local classified advertisements for jobs, property, education, vehicles and services in Roorkee and Haridwar district. Publish your own advertisement, or advertise your business in print and online with Shree Classified.',
  alternates: { canonical: '/' },
  openGraph: {
    title: `${SITE.name} | Local Classified & Advertising Platform in ${SITE.city}`,
    description:
      'Local classified and display advertising for Roorkee and Haridwar district, in print every Saturday and online all week.',
    type: 'website',
    locale: 'en_IN',
  },
};

/**
 * Homepage.
 *
 * The two advertisement bands come from the repository — `public_ads` when the
 * database is connected, the offline dataset otherwise — so an advertisement
 * whose run has ended leaves the homepage the moment it leaves the listings,
 * by the same rule and in the same query layer. The editions are still the
 * sample data; they are not advertisements.
 */
export default async function HomePage() {
  const [featured, latest] = await Promise.all([
    getFeaturedAdvertisements(4),
    getLatestAdvertisements(6),
  ]);

  return (
    <>
      <Hero />
      <CategoryGrid />
      <AdvertisementTypes />
      <FeaturedAds advertisements={featured} />
      <LatestClassifieds advertisements={latest} />
      <TodaysEdition current={CURRENT_EDITION} previous={PREVIOUS_EDITIONS} />
      <PrintDigitalSection />
      <BusinessAdvertisingSection />
      <BusinessInfoSection />
    </>
  );
}
