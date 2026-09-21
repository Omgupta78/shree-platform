/**
 * Category-specific submission fields.
 *
 * A declaration, not a component: the form renders whatever is listed here,
 * and `lib/post-ad/schema.ts` builds the validation schema from the same
 * entries. Adding a field to a category means adding one object below —
 * no new control, no new branch, no `if (category === …)` anywhere.
 *
 * Because it is plain data with no React and no browser API in sight, the
 * server action can import this file unchanged and validate against exactly
 * the rules the browser showed the advertiser.
 *
 * Two fields are deliberately NOT repeated here:
 *
 *  - Price (and salary, and rent) is collected once in the basic details
 *    step. `config/category-fields.ts` already decides, per category, whether
 *    a money figure applies at all and what to call it.
 *  - Location is collected once in the basic details step, from
 *    `config/locations.ts`.
 *
 * The `key` of every field matches the key the public pages read out of
 * `Advertisement.attributes`, so an answer given here appears on the card and
 * the detail page without any mapping in between.
 */

export type AdFieldKind = 'text' | 'select' | 'number';

export interface AdFormField {
  /** Key inside `attributes`; also the form control's name. */
  key: string;
  label: string;
  kind: AdFieldKind;
  required?: boolean;
  /** Fixed choices. Values match `CATEGORY_FACETS` so the filters keep working. */
  options?: readonly string[];
  placeholder?: string;
  hint?: string;
  /** `text` only. */
  maxLength?: number;
  /** `number` only. */
  min?: number;
  max?: number;
  /** Appended when the value is displayed, e.g. `1450 sq.ft.` */
  unit?: string;
}

const CONDITION = ['New', 'Like new', 'Good', 'Fair', 'For parts'] as const;

export const CATEGORY_FORM_FIELDS: Readonly<Record<string, readonly AdFormField[]>> = {
  jobs: [
    {
      key: 'organisation',
      label: 'Organisation or company name',
      kind: 'text',
      required: true,
      maxLength: 80,
      placeholder: 'Name as it should appear in the advertisement',
    },
    {
      key: 'jobType',
      label: 'Job type',
      kind: 'select',
      required: true,
      options: ['Full time', 'Part time', 'Walk-in'],
    },
    {
      key: 'experience',
      label: 'Experience required',
      kind: 'select',
      required: true,
      options: ['Fresher', '1-3 years', '3+ years'],
    },
    {
      key: 'qualification',
      label: 'Qualification',
      kind: 'text',
      maxLength: 60,
      placeholder: 'B.Com, ITI, Graduate…',
    },
  ],

  property: [
    {
      key: 'listingType',
      label: 'For sale or on rent',
      kind: 'select',
      required: true,
      options: ['Sale', 'Rent'],
    },
    {
      key: 'propertyType',
      label: 'Property type',
      kind: 'select',
      required: true,
      options: ['House', 'Flat', 'Plot', 'Shop', 'Office'],
    },
    { key: 'bedrooms', label: 'Bedrooms', kind: 'number', min: 0, max: 20 },
    { key: 'bathrooms', label: 'Bathrooms', kind: 'number', min: 0, max: 20 },
    {
      key: 'areaSqft',
      label: 'Area',
      kind: 'number',
      min: 1,
      max: 1_000_000,
      unit: 'sq.ft.',
      hint: 'In square feet.',
    },
    {
      key: 'furnishing',
      label: 'Furnished status',
      kind: 'select',
      options: ['Unfurnished', 'Semi-furnished', 'Furnished'],
    },
  ],

  vehicles: [
    {
      key: 'vehicleType',
      label: 'Vehicle type',
      kind: 'select',
      required: true,
      options: ['Car', 'Two-wheeler', 'Commercial'],
    },
    { key: 'brand', label: 'Brand', kind: 'text', required: true, maxLength: 40 },
    { key: 'model', label: 'Model', kind: 'text', maxLength: 40 },
    {
      key: 'year',
      label: 'Year of manufacture',
      kind: 'number',
      min: 1950,
      max: new Date().getFullYear() + 1,
    },
    { key: 'condition', label: 'Condition', kind: 'select', options: [...CONDITION] },
  ],

  education: [
    {
      key: 'institutionType',
      label: 'Institution type',
      kind: 'select',
      required: true,
      options: ['University', 'College', 'Coaching', 'School'],
    },
    {
      key: 'institution',
      label: 'Institution name',
      kind: 'text',
      required: true,
      maxLength: 80,
    },
    { key: 'course', label: 'Course', kind: 'text', required: true, maxLength: 60 },
    {
      key: 'duration',
      label: 'Duration',
      kind: 'text',
      maxLength: 40,
      placeholder: 'Six months, two years…',
    },
  ],

  business: [
    {
      key: 'businessType',
      label: 'Business type',
      kind: 'text',
      required: true,
      maxLength: 60,
      placeholder: 'Distribution, franchise, partnership…',
    },
    { key: 'organisation', label: 'Business name', kind: 'text', maxLength: 80 },
  ],

  services: [
    {
      key: 'serviceType',
      label: 'Service type',
      kind: 'text',
      required: true,
      maxLength: 60,
      placeholder: 'Electrical work, tailoring, tuition…',
    },
    {
      key: 'provider',
      label: 'Business or service provider name',
      kind: 'text',
      maxLength: 80,
    },
  ],

  'buy-sell': [
    {
      key: 'itemType',
      label: 'Product type',
      kind: 'text',
      required: true,
      maxLength: 60,
      placeholder: 'Furniture, mobile phone, machinery…',
    },
    { key: 'condition', label: 'Condition', kind: 'select', required: true, options: [...CONDITION] },
  ],

  /**
   * Matrimonial is kept deliberately thin.
   *
   * A matrimonial notice in the paper carries very little: who is looking,
   * roughly how old, and what they do. Caste, religion, income, complexion,
   * horoscope details and photographs are not asked for. They are sensitive,
   * they are not needed to run the advertisement, and data not collected
   * cannot leak. Anything further belongs in the advertiser's own words in
   * the description, where they control it.
   */
  matrimonial: [
    {
      key: 'seeking',
      label: 'Seeking',
      kind: 'select',
      required: true,
      options: ['Bride', 'Groom'],
    },
    {
      key: 'ageRange',
      label: 'Age range',
      kind: 'text',
      maxLength: 20,
      placeholder: '26 to 30',
      hint: 'A range is enough. Please do not enter a date of birth.',
    },
    {
      key: 'education',
      label: 'Education',
      kind: 'text',
      maxLength: 60,
      placeholder: 'Graduate, post-graduate…',
    },
  ],

  others: [
    {
      key: 'noticeType',
      label: 'Type of announcement',
      kind: 'text',
      required: true,
      maxLength: 60,
      placeholder: 'Public notice, lost and found, tender…',
    },
  ],
};

export function categoryFormFields(categorySlug: string | null): readonly AdFormField[] {
  if (!categorySlug) return [];
  return CATEGORY_FORM_FIELDS[categorySlug] ?? [];
}

/** Every key any category may submit. The server uses it to reject strays. */
export const ALL_FIELD_KEYS: readonly string[] = Array.from(
  new Set(Object.values(CATEGORY_FORM_FIELDS).flatMap((fields) => fields.map((f) => f.key))),
);
