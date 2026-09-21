import type { CategoryIconName } from '@/components/ui/icons';

/**
 * The single source of truth for classified categories.
 *
 * Drawn from the sections that actually run in the printed edition. Any
 * component that needs a category name, icon, description or link reads it
 * from here — categories are never spelled out in JSX.
 *
 * `slug` matches the `categories.slug` column in the database, so replacing
 * this file with a query later changes no consumer.
 */
export interface Category {
  slug: string;
  name: string;
  /** One line, shown on the category card. */
  description: string;
  icon: CategoryIconName;
  /** Printed section heading, where the paper uses one. */
  printedAs?: string;
}

export const CATEGORIES: readonly Category[] = [
  {
    slug: 'jobs',
    name: 'Jobs & Recruitment',
    description: 'Vacancies, walk-in interviews and staff requirements.',
    icon: 'briefcase',
    printedAs: 'आवश्यकता है',
  },
  {
    slug: 'property',
    name: 'Property',
    description: 'Houses, plots, shops and offices for sale or on rent.',
    icon: 'building',
    printedAs: 'किराये हेतु',
  },
  {
    slug: 'education',
    name: 'Education',
    description: 'Admissions, coaching classes, tuition and guidance.',
    icon: 'graduation',
    printedAs: 'ADMISSION OPEN',
  },
  {
    slug: 'vehicles',
    name: 'Vehicles',
    description: 'Cars, two-wheelers, commercial vehicles and spares.',
    icon: 'car',
  },
  {
    slug: 'business',
    name: 'Business',
    description: 'Businesses for sale, machinery, wholesale and trade.',
    icon: 'store',
  },
  {
    slug: 'services',
    name: 'Services',
    description: 'Local trades, repairs, catering, travel and professionals.',
    icon: 'wrench',
  },
  {
    slug: 'matrimonial',
    name: 'Matrimonial',
    description: 'Marriage proposals from families across the district.',
    icon: 'heart',
  },
  {
    slug: 'buy-sell',
    name: 'Buy & Sell',
    description: 'Mobiles, electronics, furniture and household goods.',
    icon: 'tag',
  },
  {
    slug: 'others',
    name: 'Others',
    description: 'Public notices, tenders, lost and found, and events.',
    icon: 'megaphone',
    printedAs: 'सूचना',
  },
] as const;

/** Lookup used by advertisement cards to resolve a category slug to its label. */
export const CATEGORY_BY_SLUG: ReadonlyMap<string, Category> = new Map(
  CATEGORIES.map((category) => [category.slug, category]),
);

export function categoryHref(slug: string): string {
  return `/classifieds/${slug}`;
}
