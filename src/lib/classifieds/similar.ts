import type { Advertisement } from '@/types/content';

/**
 * Picking related advertisements.
 *
 * A pure scoring function so the rule is readable in one place and can be
 * translated to SQL later. Ordering, not thresholds: everything in the same
 * category is eligible, and the score decides which rise to the top.
 *
 * Weights, highest first:
 *   same category      required — a flat is never "similar" to a vacancy
 *   same location      strong   — locality is the second thing a reader filters on
 *   shared attribute   moderate — a flat for rent near another flat for rent
 *   similar price      moderate — within half to double the asking figure
 *   featured           slight   — a nudge, not a takeover
 *   recency            tie-break
 */
const WEIGHT = {
  sameLocation: 40,
  sharedAttribute: 15,
  similarPrice: 20,
  featured: 5,
} as const;

export function similarityScore(base: Advertisement, candidate: Advertisement): number {
  let score = 0;

  if (candidate.locationSlug === base.locationSlug) score += WEIGHT.sameLocation;

  // Category attributes overlapping — a house against a house, a full-time
  // vacancy against a full-time vacancy.
  for (const [key, value] of Object.entries(base.attributes)) {
    if (key === 'organisation') continue;
    if (candidate.attributes[key] === value) score += WEIGHT.sharedAttribute;
  }

  if (base.price !== null && candidate.price !== null && base.price > 0) {
    const ratio = candidate.price / base.price;
    if (ratio >= 0.5 && ratio <= 2) score += WEIGHT.similarPrice;
  }

  if (candidate.isFeatured) score += WEIGHT.featured;

  return score;
}

/**
 * Related advertisements for a detail page.
 *
 * The advertisement being viewed is always excluded — by id, so a duplicate
 * slug could never let it through.
 */
export function findSimilar(
  base: Advertisement,
  pool: readonly Advertisement[],
  limit = 4,
): Advertisement[] {
  return pool
    .filter(
      (candidate) =>
        candidate.id !== base.id &&
        candidate.categorySlug === base.categorySlug &&
        candidate.status === 'approved',
    )
    .map((candidate) => ({ candidate, score: similarityScore(base, candidate) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.candidate.publishedAt.localeCompare(a.candidate.publishedAt),
    )
    .slice(0, limit)
    .map((entry) => entry.candidate);
}
