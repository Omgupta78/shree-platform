import { submitAdvertisementAction } from '@/app/post-ad/actions';
import type { AdvertisementType } from '@/config/ad-types';
import { isSupabaseConfigured } from '@/lib/env';
import { classifiedSubmissionSchema, displaySubmissionSchema } from '@/lib/post-ad/schema';
import { isClassified, type AdvertisementSubmission, type SubmissionResult } from '@/types/submission';

/**
 * Submission.
 *
 * Two paths, one signature. With a database connected the advertisement goes
 * to the server action in `app/post-ad/actions.ts`; without one it is
 * validated and acknowledged locally so the form can still be walked through,
 * with a reference that says DEMO on its face.
 *
 * The validation below is not the gate. It is the same schema the server runs
 * again on what it receives, so an advertisement cannot "succeed" here on a
 * payload the server would reject — but it is the server's answer that
 * decides.
 *
 * Files travel as `File` entries on the FormData rather than inside the JSON:
 * a photograph base64'd into a string is a third larger and has to be decoded
 * before it can be sniffed.
 */

const DEMO_PREFIX = 'SC-DEMO-';

/**
 * A reference for the confirmation screen only.
 *
 * Obviously a demo: real references are allocated by the database so that two
 * submissions arriving at the same moment cannot collide, which a random
 * number in a browser cannot promise.
 */
export function demoReference(): string {
  const random = Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, '0');
  return `${DEMO_PREFIX}${random}`;
}

export function isDemoReference(reference: string): boolean {
  return reference.startsWith(DEMO_PREFIX);
}

export class SubmissionError extends Error {
  /** `auth` means "sign in first", which the form handles differently. */
  readonly code: 'auth' | 'invalid' | 'upload' | 'unavailable' | 'failed';

  constructor(message: string, code: SubmissionError['code'] = 'invalid') {
    super(message);
    this.name = 'SubmissionError';
    this.code = code;
  }
}

/** The payload shape each schema expects, without the files. */
function toPayload(submission: AdvertisementSubmission): Record<string, unknown> {
  if (isClassified(submission)) {
    return {
      advertisementType: 'classified',
      categorySlug: submission.categorySlug,
      title: submission.title,
      description: submission.description,
      locationSlug: submission.locationSlug,
      price: submission.price,
      categorySpecificData: submission.categorySpecificData,
      contact: submission.contact,
      packageId: submission.packageId,
    };
  }
  return {
    advertisementType: 'display',
    organisationName: submission.organisationName,
    title: submission.title,
    description: submission.description,
    locationSlug: submission.locationSlug,
    contact: submission.contact,
    website: submission.website,
    notes: submission.notes,
  };
}

function validateLocally(submission: AdvertisementSubmission): void {
  const payload = toPayload(submission);
  const parsed = isClassified(submission)
    ? classifiedSubmissionSchema.safeParse({ ...payload, imageCount: submission.images.length })
    : displaySubmissionSchema.safeParse({ ...payload, artworkCount: submission.artwork.length });

  if (!parsed.success) {
    throw new SubmissionError('The advertisement is not complete.');
  }
}

export async function submitAdvertisement(
  submission: AdvertisementSubmission,
): Promise<SubmissionResult> {
  validateLocally(submission);

  const advertisementType: AdvertisementType = submission.advertisementType;

  if (!isSupabaseConfigured) {
    // Stands in for the round trip, so the button's pending state is real.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return {
      reference: demoReference(),
      advertisementType,
      receivedAt: new Date().toISOString(),
    };
  }

  const formData = new FormData();
  formData.set('payload', JSON.stringify(toPayload(submission)));

  if (isClassified(submission)) {
    for (const image of submission.images) formData.append('images', image.file, image.name);
  } else {
    for (const file of submission.artwork) formData.append('artwork', file.file, file.name);
  }

  const result = await submitAdvertisementAction(formData);

  if (!result.ok || !result.reference) {
    throw new SubmissionError(
      result.message ?? 'The advertisement could not be sent.',
      result.code ?? 'failed',
    );
  }

  return {
    reference: result.reference,
    advertisementId: result.advertisementId,
    paymentDue: result.paymentDue ?? false,
    advertisementType: result.advertisementType ?? advertisementType,
    receivedAt: result.receivedAt ?? new Date().toISOString(),
  };
}
