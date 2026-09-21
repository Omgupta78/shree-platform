/**
 * The advertisement submission model.
 *
 * ONE definition, shared by the form, the client validation, the preview and —
 * later — the server action, the Supabase insert, the moderation queue and
 * the payment record. Nothing in the form invents a shape of its own.
 *
 * Two things are deliberately absent:
 *
 *  - No status. Whether a submission is pending, approved or rejected is the
 *    server's business; a client that could name its own status could name
 *    `approved`.
 *  - No price for the package. `packageId` is a reference only. What that
 *    package costs is read from configuration (and later the database) at the
 *    moment of pricing, on the server. See `config/packages.ts`.
 *
 * Images are held as `SubmissionImage`, which carries the `File` while the
 * form is open. Nothing is uploaded yet; `lib/post-ad/images.ts` explains the
 * seam where storage arrives.
 */

import type { AdvertisementType } from '@/config/ad-types';

/** An image chosen in the browser but not yet uploaded anywhere. */
export interface SubmissionImage {
  /** Stable id for list keys, reordering and removal. */
  id: string;
  /** The file itself. Never serialised into a draft. */
  file: File;
  /** `URL.createObjectURL(file)`, revoked when the image is dropped. */
  previewUrl: string;
  name: string;
  size: number;
  type: string;
}

/** Contact details, plus what the advertiser agreed to publish. */
export interface ContactInformation {
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  /**
   * Consent, not presentation. The public page shows a number only when the
   * advertiser ticked the box; the server re-checks this before publishing,
   * because a client can send anything.
   */
  showPhonePublicly: boolean;
  allowWhatsApp: boolean;
}

/**
 * Category-specific answers.
 *
 * Keys match `config/ad-form-fields.ts`, which in turn matches the keys used
 * by the public pages (`config/category-fields.ts`) and the `attributes`
 * JSONB column, so an answer collected here lands on the detail page without
 * translation.
 */
export type CategorySpecificData = Record<string, string>;

/** The classified advertisement branch. */
export interface ClassifiedSubmission {
  advertisementType: 'classified';
  categorySlug: string;
  title: string;
  description: string;
  locationSlug: string;
  /** Kept as typed text; parsed and validated, never trusted as a number. */
  price: string;
  categorySpecificData: CategorySpecificData;
  contact: ContactInformation;
  images: SubmissionImage[];
  /** Reference into `config/packages.ts`. Carries no price. */
  packageId: string;
}

/** The display advertisement branch — a request for a quotation, in effect. */
export interface DisplaySubmission {
  advertisementType: 'display';
  organisationName: string;
  title: string;
  description: string;
  locationSlug: string;
  contact: ContactInformation;
  website: string;
  /** Artwork supplied by the advertiser or their agency. */
  artwork: SubmissionImage[];
  notes: string;
}

export type AdvertisementSubmission = ClassifiedSubmission | DisplaySubmission;

export function isClassified(
  submission: AdvertisementSubmission,
): submission is ClassifiedSubmission {
  return submission.advertisementType === 'classified';
}

export function isDisplay(
  submission: AdvertisementSubmission,
): submission is DisplaySubmission {
  return submission.advertisementType === 'display';
}

/* ------------------------------------------------------------- drafts ---- */

/**
 * What a draft keeps.
 *
 * Files are not serialisable and, more to the point, a browser cannot restore
 * a `File` it did not receive from a user gesture — so images are dropped from
 * the draft and the reader is told. Contact details are text the advertiser
 * typed about themselves for publication, so keeping them is what they expect;
 * nothing else about them is stored.
 */
export type DraftSubmission =
  | (Omit<ClassifiedSubmission, 'images'> & { imageCount: number })
  | (Omit<DisplaySubmission, 'artwork'> & { artworkCount: number });

export interface StoredDraft {
  version: number;
  savedAt: string;
  submission: DraftSubmission;
  /** Step the advertiser had reached, so they resume where they left off. */
  stepId: string;
}

/* ------------------------------------------------------------- result ---- */

export interface SubmissionResult {
  reference: string;
  advertisementType: AdvertisementType;
  receivedAt: string;
}
