/**
 * Coverage area.
 *
 * Roorkee and the surrounding towns of Haridwar district, matching where the
 * printed edition circulates. This is a starting list, not a declaration that
 * advertisements are accepted only from these places — "Nearby areas" exists
 * precisely so nothing is excluded.
 *
 * Replaced by the `locations` table later; the slug is the database key.
 */
export interface LocationOption {
  slug: string;
  name: string;
}

export const LOCATIONS: readonly LocationOption[] = [
  { slug: 'roorkee', name: 'Roorkee' },
  { slug: 'haridwar', name: 'Haridwar' },
  { slug: 'manglaur', name: 'Manglaur' },
  { slug: 'bhagwanpur', name: 'Bhagwanpur' },
  { slug: 'landhaura', name: 'Landhaura' },
  { slug: 'laksar', name: 'Laksar' },
  { slug: 'jwalapur', name: 'Jwalapur' },
  { slug: 'piran-kaliyar', name: 'Piran Kaliyar' },
  { slug: 'nearby', name: 'Nearby areas' },
] as const;

export const LOCATION_BY_SLUG: ReadonlyMap<string, LocationOption> = new Map(
  LOCATIONS.map((location) => [location.slug, location]),
);

export function locationName(slug: string): string {
  return LOCATION_BY_SLUG.get(slug)?.name ?? slug;
}
