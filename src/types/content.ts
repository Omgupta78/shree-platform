/**
 * Content shapes used across the site.
 *
 * These deliberately mirror the database schema in `supabase/migrations`, so
 * that swapping the mock source for a Supabase query later is a change of data
 * source only — no component props change.
 */

/** Matches `classified_ads.format`. Doubles as the "advertisement type" filter. */
export type AdvertisementFormat = 'line' | 'boxed' | 'photo' | 'featured';

/** Matches `classified_ads.price_type`. */
export type PriceType = 'fixed' | 'negotiable' | 'on_call' | 'free';

/** Matches the `ad_status` enum. */
export type AdStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'sold';

/**
 * Only approved advertisements are public. The detail page and the sitemap
 * both read this so that pending, rejected or expired advertisements are never
 * indexed once the real database is connected.
 */
export function isPubliclyVisible(status: AdStatus): boolean {
  return status === 'approved';
}

/**
 * The whole public rule, for the offline dataset: approved AND still inside
 * its run. `public_ads` applies the same two conditions in SQL; this is its
 * translation for the branch that has no database.
 */
export function isActiveListing(
  ad: { status: AdStatus; expiresAt: string | null },
  now: Date = new Date(),
): boolean {
  return isPubliclyVisible(ad.status) && (ad.expiresAt === null || new Date(ad.expiresAt) > now);
}

/**
 * Category-specific fields. Mirrors the `attributes` JSONB column, so adding a
 * field to one category never requires a migration or a type change here.
 */
export type AdAttributes = Readonly<Record<string, string | number>>;

/**
 * A classified advertisement.
 *
 * Field names follow the database columns. `reference` is the code printed
 * beside the advertisement in the paper.
 */
export interface Advertisement {
  id: string;
  reference: string;
  slug: string;
  title: string;
  /** One or two lines shown on the card. */
  summary: string;
  /** Full body copy, shown on the detail page. Paragraphs separated by blank lines. */
  description: string;
  categorySlug: string;
  /** Slug from the location configuration; the display name is resolved from it. */
  locationSlug: string;
  price: number | null;
  priceType: PriceType;
  format: AdvertisementFormat;
  isFeatured: boolean;
  status: AdStatus;
  /** ISO timestamp. */
  publishedAt: string;
  /** ISO timestamp, null when never edited since publication. */
  updatedAt: string | null;
  /** ISO timestamp, null when no expiry is set. */
  expiresAt: string | null;
  /** Gallery images, in order. Empty when the advertiser supplied none. */
  images: readonly string[];
  /** Advertiser name as it appears on the advertisement. */
  contactName: string;
  /** Ten-digit Indian mobile, or null when not supplied. */
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  /** ISO date the advertiser first appeared, for "advertising since". */
  advertiserSince: string | null;
  attributes: AdAttributes;
}

/** Matches the `editions` table. */
export interface Edition {
  id: string;
  /** ISO date of the printed edition. */
  editionDate: string;
  pageCount: number;
  /** Null until edition management exists. */
  coverImageUrl: string | null;
  /** Null until PDF management exists. */
  pdfUrl: string | null;
}
