import 'server-only';

import { CATEGORIES, CATEGORY_BY_SLUG } from '@/config/categories';
import { LOCATIONS, LOCATION_BY_SLUG } from '@/config/locations';
import { countByCategoryAndLocation } from '@/lib/data/classifieds-repository';

/**
 * Which "jobs in Roorkee" pages are worth having.
 *
 * Nine categories and nine places is eighty-one URLs that could be generated
 * in a loop, and doing exactly that is the doorway-page mistake: eighty-one
 * near-identical pages, most of them showing "no advertisements found", every
 * one competing with the section it was cut from. Google calls them thin
 * pages and the brief says not to make them.
 *
 * So a pair earns its page by having advertisements in it. Below the
 * threshold the URL still WORKS — somebody who filters their way there, or
 * follows an old link, gets a real page with the real (small) list — but it
 * asks not to be indexed and it stays out of the sitemap. Above the
 * threshold it is a landing page with genuine local inventory behind it,
 * which is what a person searching "property in Manglaur" actually wanted.
 *
 * The threshold is a judgement, not a measurement, so it is written down once
 * here with its reasoning rather than scattered as a magic number.
 */

/**
 * Three. Fewer than that and the page is mostly whitespace and a heading —
 * the reader learns nothing they would not have learnt from the section, and
 * there is nothing for a search engine to distinguish it by.
 */
export const LANDING_MINIMUM_ADS = 3;

/** "Nearby areas" is a catch-all, not a place somebody searches for. */
const EXCLUDED_LOCATIONS = new Set(['nearby']);

export interface LocationLanding {
  categorySlug: string;
  categoryName: string;
  locationSlug: string;
  locationName: string;
  /** Live advertisements in this pair, right now. */
  count: number;
  path: string;
}

/** Is this a pair the site is willing to show at all? Both slugs must be known. */
export function isKnownPair(categorySlug: string, locationSlug: string): boolean {
  return (
    CATEGORY_BY_SLUG.has(categorySlug) &&
    LOCATION_BY_SLUG.has(locationSlug) &&
    !EXCLUDED_LOCATIONS.has(locationSlug)
  );
}

/**
 * Every pair that currently has enough behind it to be a landing page.
 *
 * Read fresh. Inventory in a classifieds section moves week to week, so a list
 * baked at build time would keep offering a page that emptied in March and
 * keep hiding one that filled in April.
 */
export async function liveLocationLandings(): Promise<LocationLanding[]> {
  const counts = await countByCategoryAndLocation();
  const landings: LocationLanding[] = [];

  for (const category of CATEGORIES) {
    for (const location of LOCATIONS) {
      if (!isKnownPair(category.slug, location.slug)) continue;
      const count = counts[`${category.slug}/${location.slug}`] ?? 0;
      if (count < LANDING_MINIMUM_ADS) continue;

      landings.push({
        categorySlug: category.slug,
        categoryName: category.name,
        locationSlug: location.slug,
        locationName: location.name,
        count,
        path: `/classifieds/${category.slug}/${location.slug}`,
      });
    }
  }

  // Busiest first: this order is what the sitemap and the in-page links use,
  // so the pages with the most on them are the ones offered first.
  return landings.sort((a, b) => b.count - a.count);
}

/** How many live advertisements one pair has. Used to decide indexability. */
export async function countForPair(categorySlug: string, locationSlug: string): Promise<number> {
  const counts = await countByCategoryAndLocation();
  return counts[`${categorySlug}/${locationSlug}`] ?? 0;
}

/**
 * The other places this category is currently running in, for linking out of
 * a landing page. Never includes the page it is on.
 */
export async function siblingLandings(
  categorySlug: string,
  exceptLocation: string,
  limit = 6,
): Promise<LocationLanding[]> {
  const all = await liveLocationLandings();
  return all
    .filter((l) => l.categorySlug === categorySlug && l.locationSlug !== exceptLocation)
    .slice(0, limit);
}
