/**
 * Per-category field configuration.
 *
 * Three separate concerns, all keyed by category slug and all optional:
 *
 *  - `PRICE_ROLE`   whether a category has a money value at all, and what to
 *                   call it. Drives both the card and the price filter.
 *  - `CARD_FIELDS`  which `attributes` keys a listing card should surface.
 *  - `CATEGORY_FACETS`  category-specific filters.
 *
 * Adding a category-specific filter is a matter of adding an entry here; the
 * sidebar, the mobile drawer, the active-filter chips and the query parser all
 * read from this one place. Nothing needs a new component.
 */

export type PriceRole = 'price' | 'salary' | 'rent' | 'none';

/**
 * Categories where a money figure is meaningless (a matrimonial notice, a
 * public notice) are marked `none`, which hides the price filter and the price
 * line on the card.
 */
export const PRICE_ROLE: Readonly<Record<string, PriceRole>> = {
  jobs: 'salary',
  property: 'price',
  education: 'none',
  vehicles: 'price',
  business: 'price',
  services: 'price',
  matrimonial: 'none',
  'buy-sell': 'price',
  others: 'none',
};

export function priceRole(categorySlug: string | null): PriceRole {
  if (!categorySlug) return 'price';
  return PRICE_ROLE[categorySlug] ?? 'price';
}

export const PRICE_LABEL: Readonly<Record<PriceRole, string>> = {
  price: 'Price',
  salary: 'Salary',
  rent: 'Rent',
  none: '',
};

/* ------------------------------------------------------------- cards ---- */

export interface CardField {
  /** Key inside `Advertisement.attributes`. */
  key: string;
  label: string;
}

/**
 * Only the two or three fields that genuinely help someone scanning a list.
 * A field absent from an advertisement's attributes is simply not rendered.
 */
export const CARD_FIELDS: Readonly<Record<string, readonly CardField[]>> = {
  jobs: [
    { key: 'organisation', label: 'Employer' },
    { key: 'jobType', label: 'Type' },
    { key: 'experience', label: 'Experience' },
    { key: 'qualification', label: 'Qualification' },
  ],
  property: [
    { key: 'listingType', label: 'For' },
    { key: 'propertyType', label: 'Type' },
    { key: 'bedrooms', label: 'Bedrooms' },
    { key: 'areaSqft', label: 'Area' },
  ],
  vehicles: [
    { key: 'vehicleType', label: 'Vehicle' },
    { key: 'brand', label: 'Brand' },
    { key: 'year', label: 'Year' },
  ],
  education: [
    { key: 'institutionType', label: 'Institution' },
    { key: 'course', label: 'Course' },
  ],
  business: [{ key: 'businessType', label: 'Type' }],
  services: [{ key: 'serviceType', label: 'Service' }],
  matrimonial: [
    { key: 'seeking', label: 'Seeking' },
    { key: 'education', label: 'Education' },
  ],
  'buy-sell': [{ key: 'itemType', label: 'Item' }, { key: 'condition', label: 'Condition' }],
  others: [{ key: 'noticeType', label: 'Notice' }],
};

export function cardFields(categorySlug: string): readonly CardField[] {
  return CARD_FIELDS[categorySlug] ?? [];
}

/* ----------------------------------------------------------- facets ----- */

export interface FacetOption {
  value: string;
  label: string;
}

export interface Facet {
  /** Key inside `attributes`, and the URL query parameter name. */
  key: string;
  label: string;
  options: readonly FacetOption[];
}

/**
 * Category-specific filters. A deliberately small first set — the structure
 * matters more than the coverage at this stage, and every one of these is
 * rendered by the same generic control.
 */
export const CATEGORY_FACETS: Readonly<Record<string, readonly Facet[]>> = {
  jobs: [
    {
      key: 'jobType',
      label: 'Job type',
      options: [
        { value: 'Full time', label: 'Full time' },
        { value: 'Part time', label: 'Part time' },
        { value: 'Walk-in', label: 'Walk-in interview' },
      ],
    },
    {
      key: 'experience',
      label: 'Experience',
      options: [
        { value: 'Fresher', label: 'Fresher' },
        { value: '1-3 years', label: '1 to 3 years' },
        { value: '3+ years', label: 'More than 3 years' },
      ],
    },
  ],
  property: [
    {
      key: 'listingType',
      label: 'Sale or rent',
      options: [
        { value: 'Sale', label: 'For sale' },
        { value: 'Rent', label: 'For rent' },
      ],
    },
    {
      key: 'propertyType',
      label: 'Property type',
      options: [
        { value: 'House', label: 'House' },
        { value: 'Flat', label: 'Flat' },
        { value: 'Plot', label: 'Plot' },
        { value: 'Shop', label: 'Shop' },
        { value: 'Office', label: 'Office' },
      ],
    },
  ],
  vehicles: [
    {
      key: 'vehicleType',
      label: 'Vehicle type',
      options: [
        { value: 'Car', label: 'Car' },
        { value: 'Two-wheeler', label: 'Two-wheeler' },
        { value: 'Commercial', label: 'Commercial' },
      ],
    },
  ],
  education: [
    {
      key: 'institutionType',
      label: 'Institution',
      options: [
        { value: 'University', label: 'University' },
        { value: 'College', label: 'College' },
        { value: 'Coaching', label: 'Coaching centre' },
        { value: 'School', label: 'School' },
      ],
    },
  ],
};

export function categoryFacets(categorySlug: string | null): readonly Facet[] {
  if (!categorySlug) return [];
  return CATEGORY_FACETS[categorySlug] ?? [];
}
