import type { CategoryIconName } from '@/components/ui/icons';

/**
 * The kinds of advertisement a customer can ask for.
 *
 * Both already exist in the printed paper: the classified strips along the
 * top of a page, and the display blocks that fill most of it. A third kind
 * (an insert, a supplement, a front-page strip) is added by appending an
 * entry here — the selector, the step machinery and the routing all read this
 * list rather than naming the two types in JSX.
 */
export type AdvertisementType = 'classified' | 'display';

export interface AdvertisementTypeOption {
  id: AdvertisementType;
  name: string;
  /** One line under the heading on the selection card. */
  tagline: string;
  description: string;
  icon: CategoryIconName;
  /** Concrete "this is for you if…" examples, in the customer's language. */
  examples: readonly string[];
  /** Shown on the card so the customer knows what happens after submitting. */
  handling: string;
}

export const ADVERTISEMENT_TYPES: readonly AdvertisementTypeOption[] = [
  {
    id: 'classified',
    name: 'Classified Advertisement',
    tagline: 'A short text advertisement in a section.',
    description:
      'Written as a few lines under a heading, with a photograph where it helps. This is the usual choice for a vacancy, a property, a vehicle or a service.',
    icon: 'tag',
    examples: [
      'Jobs and staff requirements',
      'Property for sale or on rent',
      'Vehicles',
      'Education and coaching',
      'Matrimonial',
      'Services',
      'Buy and sell',
      'Other announcements',
    ],
    handling: 'Reviewed before publication.',
  },
  {
    id: 'display',
    name: 'Display Advertisement',
    tagline: 'A designed block with your own artwork.',
    description:
      'A larger advertisement carrying your own design, logo and colours, placed within a page or across a spread. This is what institutions and brands book.',
    icon: 'building',
    examples: [
      'Businesses and shops',
      'Schools, colleges and universities',
      'Brands and dealerships',
      'Promotional campaigns and events',
      'Large visual advertisements',
    ],
    handling: 'Reviewed by our advertising team, who confirm size and pricing.',
  },
] as const;

export const AD_TYPE_BY_ID: ReadonlyMap<AdvertisementType, AdvertisementTypeOption> = new Map(
  ADVERTISEMENT_TYPES.map((option) => [option.id, option]),
);

export function isAdvertisementType(value: string): value is AdvertisementType {
  return AD_TYPE_BY_ID.has(value as AdvertisementType);
}
