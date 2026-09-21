import type { AdvertisementType } from '@/config/ad-types';

/**
 * The steps of the form, as data.
 *
 * The progress indicator, the navigation, the draft (which records where the
 * advertiser had reached) and the step validator all read this list. Adding a
 * step — a payment step, say — means adding an entry and the fields it owns;
 * nothing counts steps by hand.
 */
export interface StepDefinition {
  id: string;
  /** Short label for the progress indicator. */
  label: string;
  /** Heading above the step's fields. */
  heading: string;
  description?: string;
  /**
   * Field paths this step is responsible for, matched as prefixes against the
   * validation errors. `contact` covers `contact.phone` and the rest.
   */
  fields: readonly string[];
}

export const CLASSIFIED_STEPS: readonly StepDefinition[] = [
  {
    id: 'type',
    label: 'Type',
    heading: 'What would you like to advertise?',
    description: 'Choose the kind of advertisement you want to book.',
    fields: ['advertisementType'],
  },
  {
    id: 'category',
    label: 'Category',
    heading: 'Choose a category',
    description: 'Your advertisement appears under this section.',
    fields: ['categorySlug'],
  },
  {
    id: 'details',
    label: 'Details',
    heading: 'Basic information',
    description: 'What you are advertising, in your own words.',
    fields: ['title', 'description', 'locationSlug', 'price'],
  },
  {
    id: 'specifics',
    label: 'Specifics',
    heading: 'Category details',
    description: 'A few extra fields so readers can find your advertisement.',
    fields: ['categorySpecificData'],
  },
  {
    id: 'contact',
    label: 'Contact',
    heading: 'Contact information',
    description: 'How interested readers should reach you.',
    fields: ['contact'],
  },
  {
    id: 'images',
    label: 'Images',
    heading: 'Photographs',
    description: 'Optional, but an advertisement with a photograph gets read more often.',
    fields: ['imageCount'],
  },
  {
    id: 'package',
    label: 'Package',
    heading: 'Choose a package',
    description: 'How prominently your advertisement is placed.',
    fields: ['packageId'],
  },
  {
    id: 'preview',
    label: 'Preview',
    heading: 'Check your advertisement',
    description: 'This is how it will appear once approved. Please read it through.',
    fields: [],
  },
];

export const DISPLAY_STEPS: readonly StepDefinition[] = [
  {
    id: 'type',
    label: 'Type',
    heading: 'What would you like to advertise?',
    description: 'Choose the kind of advertisement you want to book.',
    fields: ['advertisementType'],
  },
  {
    id: 'details',
    label: 'Details',
    heading: 'About your advertisement',
    description: 'Who the advertisement is for and what it is about.',
    fields: ['organisationName', 'title', 'description', 'locationSlug', 'website'],
  },
  {
    id: 'contact',
    label: 'Contact',
    heading: 'Contact information',
    description: 'How our advertising team should reach you.',
    fields: ['contact'],
  },
  {
    id: 'artwork',
    label: 'Artwork',
    heading: 'Advertisement artwork',
    description: 'Send your design if you have one. Our team can also prepare it.',
    fields: ['artworkCount', 'notes'],
  },
  {
    id: 'preview',
    label: 'Preview',
    heading: 'Check your request',
    description: 'Please read it through before sending it to our advertising team.',
    fields: [],
  },
];

export function stepsFor(type: AdvertisementType | null): readonly StepDefinition[] {
  if (type === 'display') return DISPLAY_STEPS;
  // Before a type is chosen the classified list is shown, because its first
  // step is the type chooser itself and the two lists share it.
  return CLASSIFIED_STEPS;
}

export function stepIndexById(type: AdvertisementType | null, stepId: string): number {
  const index = stepsFor(type).findIndex((step) => step.id === stepId);
  return index === -1 ? 0 : index;
}

/** True when an error path belongs to a step, e.g. `contact.phone` ∈ `contact`. */
export function ownsField(step: StepDefinition, path: string): boolean {
  return step.fields.some((field) => field === path || path.startsWith(`${field}.`));
}
