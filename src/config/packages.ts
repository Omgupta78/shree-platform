/**
 * Advertisement packages.
 *
 * NO PRICES. Rates for Shree Classified are quoted by the office and have not
 * been given to me, so inventing a number here would put a figure in front of
 * a customer that nobody at the business agreed to. Every package therefore
 * carries `price: null`, and the selector shows "Pricing to be configured".
 *
 * When real rates exist they come from the database (a `packages` table read
 * on the server), not from this file and never from the browser. The form
 * sends `packageId` only; what that package costs is resolved server-side at
 * the moment of pricing. A client that could send its own price could send
 * its own discount.
 */

export interface AdPackage {
  id: string;
  name: string;
  /** One line under the name. */
  summary: string;
  /** What the advertiser actually gets. Nothing here is a claim about reach. */
  features: readonly string[];
  /** Paise, or null while pricing is unconfigured. Never read in the browser. */
  price: number | null;
  /** Marks the middle option in the card row. Presentation only. */
  highlighted?: boolean;
}

export const AD_PACKAGES: readonly AdPackage[] = [
  {
    id: 'basic',
    name: 'Basic',
    summary: 'A standard listing in its section.',
    features: [
      'Listed in its category',
      'Appears in search and filters',
      'Contact details as you chose them',
    ],
    price: null,
  },
  {
    id: 'standard',
    name: 'Standard',
    summary: 'Enhanced visibility within the section.',
    features: [
      'Everything in Basic',
      'Highlighted card in listings',
      'Photographs shown at a larger size',
    ],
    price: null,
    highlighted: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    summary: 'Featured placement.',
    features: [
      'Everything in Standard',
      'Considered for the featured band on the homepage',
      'Considered for the printed edition',
    ],
    price: null,
  },
];

export const DEFAULT_PACKAGE_ID = 'basic';

/**
 * A package as the lifecycle and — next phase — payments see it.
 *
 * Loaded from the `packages` table on the server (`lib/data/packages.ts`), with
 * `AD_PACKAGES` above as the offline fallback. Only `durationDays` drives
 * behaviour today: approval runs an advertisement for that long, and renewal
 * shows it. `price` stays null until the office supplies rates; `priority` is
 * reserved for listing precedence; `maxImages` mirrors the database limit.
 */
export interface AdvertisementPackageConfig {
  id: string;
  name: string;
  summary: string;
  features: readonly string[];
  /** Days one run lasts — the package's own, or the site default. */
  durationDays: number;
  /** True when `durationDays` is the site default rather than the package's own. */
  usesDefaultDuration: boolean;
  /** Paise, or null while pricing is unconfigured. */
  price: number | null;
  featured: boolean;
  priority: number;
  maxImages: number;
}

export const PACKAGE_BY_ID: ReadonlyMap<string, AdPackage> = new Map(
  AD_PACKAGES.map((item) => [item.id, item]),
);

/** True once real rates are loaded; until then the UI says pricing is pending. */
export const PRICING_CONFIGURED = AD_PACKAGES.some((item) => item.price !== null);

export const PRICING_PENDING_NOTE =
  'Pricing to be configured. Our advertising team will confirm the rate before your advertisement is published.';
