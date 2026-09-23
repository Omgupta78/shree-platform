'use server';

import { NotSignedInError, requireUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { isChargeable } from '@/lib/payments/amounts';
import {
  classifiedSubmissionSchema,
  displaySubmissionSchema,
  MAX_ARTWORK_FILES,
  MAX_IMAGES,
} from '@/lib/post-ad/schema';
import {
  acceptUpload,
  ARTWORK_MAX_BYTES,
  ARTWORK_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  storagePath,
  UploadRejected,
  type AcceptedUpload,
} from '@/lib/post-ad/upload';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Taking an advertisement.
 *
 * This is the seam `lib/post-ad/submit.ts` was written around, and the four
 * promises made there are kept here:
 *
 *  1. The payload is re-validated with the SAME zod schema the browser used.
 *     What runs in the browser is a courtesy to the advertiser; this is the
 *     gate.
 *  2. `user_id` comes from a verified token, never from the request.
 *  3. `status` is never sent at all — the column defaults to `draft` and is
 *     set to `pending` here; a database trigger refuses anything else from a
 *     non-staff caller, and migration 0007 revokes the privilege to insert the
 *     columns that decide placement, lifetime and price.
 *  4. `slug`, `reference` and the stamped package price are issued by the
 *     database. They are not in the insert because a statement naming them
 *     would be refused.
 *
 * Files arrive as `File` entries on the FormData rather than inside the JSON,
 * so the bytes are never base64'd through a string, and every one is sniffed
 * before it is stored.
 */

export interface SubmitResult {
  ok: boolean;
  reference?: string;
  /** Needed by the payment step to raise an order against the advertisement. */
  advertisementId?: string;
  /**
   * True when the package carries a rate worth collecting.
   *
   * Answered here, from the price the database stamped on the advertisement,
   * so that the confirmation page can decide whether to offer a checkout
   * without raising an order to find out. Every package is unpriced until the
   * office supplies rates, so today this is always false.
   */
  paymentDue?: boolean;
  advertisementType?: 'classified' | 'display';
  receivedAt?: string;
  /** `auth` when the answer is "sign in first", so the form can say so. */
  code?: 'auth' | 'invalid' | 'upload' | 'unavailable' | 'failed';
  message?: string;
}

const GENERIC_FAILURE =
  'We could not save the advertisement just now. Please try again in a moment.';

export async function submitAdvertisementAction(formData: FormData): Promise<SubmitResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      code: 'unavailable',
      message: 'The site is running without a database connection, so nothing can be submitted.',
    };
  }

  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof NotSignedInError) {
      return {
        ok: false,
        code: 'auth',
        message: 'Please sign in to send your advertisement. Your answers are saved on this device.',
      };
    }
    throw error;
  }

  /*
   * Deliberately loose — twenty an hour. Somebody correcting an advertisement
   * the office sent back may genuinely submit several times in an afternoon,
   * and refusing them would be a telephone call to the office. This is here
   * for the script that submits a thousand, not for a person in a hurry.
   */
  const limit = await checkRateLimit('postAdvertisement');
  if (!limit.allowed) {
    return { ok: false, code: 'unavailable', message: limit.message };
  }

  const raw = formData.get('payload');
  if (typeof raw !== 'string') {
    return { ok: false, code: 'invalid', message: GENERIC_FAILURE };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, code: 'invalid', message: GENERIC_FAILURE };
  }

  const photos = formData.getAll('images').filter((f): f is File => f instanceof File);
  const artwork = formData.getAll('artwork').filter((f): f is File => f instanceof File);

  return payload.advertisementType === 'display'
    ? submitDisplay(user.id, payload, artwork)
    : submitClassified(user.id, payload, photos);
}

/* ----------------------------------------------------------- classified -- */

async function submitClassified(
  userId: string,
  payload: Record<string, unknown>,
  photos: File[],
): Promise<SubmitResult> {
  if (photos.length > MAX_IMAGES) {
    return { ok: false, code: 'invalid', message: `Please use at most ${MAX_IMAGES} images.` };
  }

  // The file count is taken from the files actually received, not from a
  // number in the payload, so the two cannot be made to disagree.
  const parsed = classifiedSubmissionSchema.safeParse({
    ...payload,
    imageCount: photos.length,
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid',
      message: 'Something in the advertisement is not complete. Please check the earlier steps.',
    };
  }
  const submission = parsed.data;

  const supabase = await createSupabaseServerClient();
  const [category, location] = await Promise.all([
    lookupId(supabase, 'categories', submission.categorySlug),
    lookupId(supabase, 'locations', submission.locationSlug),
  ]);
  if (!category || !location) {
    return { ok: false, code: 'invalid', message: GENERIC_FAILURE };
  }

  let accepted: AcceptedUpload[];
  try {
    accepted = await Promise.all(
      photos.map((file) => acceptUpload(file, PHOTO_TYPES, PHOTO_MAX_BYTES)),
    );
  } catch (error) {
    if (error instanceof UploadRejected) {
      return { ok: false, code: 'upload', message: error.message };
    }
    throw error;
  }

  const price = submission.price ? Number(submission.price) : null;
  const { contact } = submission;

  const { data: ad, error } = await supabase
    .from('ads')
    .insert({
      kind: 'classified',
      user_id: userId,
      category_id: category,
      location_id: location,
      title: submission.title,
      description: submission.description,
      price,
      // No figure means the advertiser wants to be asked, which is what
      // `on_call` says. It is not the same as free.
      price_type: price === null ? 'on_call' : 'fixed',
      attributes: compactAttributes(submission.categorySpecificData),
      contact_name: contact.name,
      contact_phone: contact.phone,
      contact_whatsapp: contact.allowWhatsApp && contact.whatsapp ? contact.whatsapp : null,
      contact_email: contact.email || null,
      show_phone: contact.showPhonePublicly,
      show_whatsapp: contact.allowWhatsApp,
      status: 'pending',
      package_id: submission.packageId,
    })
    .select('id, reference, package_price_paise')
    .single();

  if (error || !ad) {
    return { ok: false, code: 'failed', message: GENERIC_FAILURE };
  }

  const stored = await storeFiles(supabase, 'ad-images', userId, ad.id, accepted);
  if (!stored.ok) {
    await rollback(supabase, ad.id);
    return { ok: false, code: 'upload', message: stored.message };
  }

  if (accepted.length) {
    const { error: imageError } = await supabase.from('ad_images').insert(
      stored.paths.map((path, index) => ({
        ad_id: ad.id,
        storage_path: path,
        sort_order: index,
      })),
    );
    if (imageError) {
      await rollback(supabase, ad.id);
      return { ok: false, code: 'failed', message: GENERIC_FAILURE };
    }
  }

  return {
    ok: true,
    reference: ad.reference,
    advertisementId: ad.id,
    paymentDue: isChargeable(ad.package_price_paise),
    advertisementType: 'classified',
    receivedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------- display -- */

async function submitDisplay(
  userId: string,
  payload: Record<string, unknown>,
  artwork: File[],
): Promise<SubmitResult> {
  if (artwork.length > MAX_ARTWORK_FILES) {
    return {
      ok: false,
      code: 'invalid',
      message: `Please attach at most ${MAX_ARTWORK_FILES} files.`,
    };
  }

  const parsed = displaySubmissionSchema.safeParse({
    ...payload,
    artworkCount: artwork.length,
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid',
      message: 'Something in the request is not complete. Please check the earlier steps.',
    };
  }
  const submission = parsed.data;

  const supabase = await createSupabaseServerClient();
  const location = await lookupId(supabase, 'locations', submission.locationSlug);
  if (!location) return { ok: false, code: 'invalid', message: GENERIC_FAILURE };

  let accepted: AcceptedUpload[];
  try {
    accepted = await Promise.all(
      artwork.map((file) => acceptUpload(file, ARTWORK_TYPES, ARTWORK_MAX_BYTES)),
    );
  } catch (error) {
    if (error instanceof UploadRejected) {
      return { ok: false, code: 'upload', message: error.message };
    }
    throw error;
  }

  const { contact } = submission;

  const { data: ad, error } = await supabase
    .from('ads')
    .insert({
      kind: 'display',
      user_id: userId,
      // No category and no package: the office places a display advertisement
      // by size and quotes it themselves. The schema requires both to be
      // absent for this kind.
      category_id: null,
      location_id: location,
      title: submission.title,
      description: submission.description,
      price_type: 'on_call',
      contact_name: contact.name,
      contact_phone: contact.phone,
      contact_whatsapp: contact.allowWhatsApp && contact.whatsapp ? contact.whatsapp : null,
      contact_email: contact.email || null,
      show_phone: contact.showPhonePublicly,
      show_whatsapp: contact.allowWhatsApp,
      status: 'pending',
    })
    .select('id, reference')
    .single();

  if (error || !ad) {
    return { ok: false, code: 'failed', message: GENERIC_FAILURE };
  }

  const { error: detailError } = await supabase.from('display_ad_details').insert({
    ad_id: ad.id,
    organisation_name: submission.organisationName,
    website: submission.website || null,
    notes: submission.notes || null,
  });
  if (detailError) {
    await rollback(supabase, ad.id);
    return { ok: false, code: 'failed', message: GENERIC_FAILURE };
  }

  // The private bucket. Artwork for a campaign that has not run is
  // commercially sensitive, and the storage policies keep it to its owner and
  // to staff.
  const stored = await storeFiles(supabase, 'ad-artwork', userId, ad.id, accepted);
  if (!stored.ok) {
    await rollback(supabase, ad.id);
    return { ok: false, code: 'upload', message: stored.message };
  }

  if (accepted.length) {
    const { error: artworkError } = await supabase.from('ad_artwork').insert(
      accepted.map((file, index) => ({
        ad_id: ad.id,
        storage_path: stored.paths[index]!,
        file_name: file.originalName,
        content_type: file.contentType,
        byte_size: file.byteSize,
        sort_order: index,
      })),
    );
    if (artworkError) {
      await rollback(supabase, ad.id);
      return { ok: false, code: 'failed', message: GENERIC_FAILURE };
    }
  }

  return {
    ok: true,
    reference: ad.reference,
    advertisementId: ad.id,
    // A display advertisement carries no package — the office places it by
    // size and quotes it themselves — so there is never anything to collect
    // at submission.
    paymentDue: false,
    advertisementType: 'display',
    receivedAt: new Date().toISOString(),
  };
}

/* --------------------------------------------------------------- shared -- */

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function lookupId(
  supabase: ServerClient,
  table: 'categories' | 'locations',
  slug: string,
): Promise<string | null> {
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return data?.id ?? null;
}

type StoreResult =
  | { ok: true; paths: string[] }
  | { ok: false; paths: string[]; message: string };

async function storeFiles(
  supabase: ServerClient,
  bucket: 'ad-images' | 'ad-artwork',
  userId: string,
  adId: string,
  files: AcceptedUpload[],
): Promise<StoreResult> {
  const paths: string[] = [];

  for (const [index, accepted] of files.entries()) {
    const path = storagePath(userId, adId, index, accepted.extension);
    const { error } = await supabase.storage.from(bucket).upload(path, accepted.file, {
      // The sniffed type, not the one the browser claimed.
      contentType: accepted.contentType,
      upsert: false,
    });

    if (error) {
      await removeFiles(supabase, bucket, paths);
      return {
        ok: false,
        paths,
        message: `${accepted.originalName} could not be uploaded. Please try again.`,
      };
    }
    paths.push(path);
  }

  return { ok: true, paths };
}

async function removeFiles(supabase: ServerClient, bucket: string, paths: string[]) {
  if (paths.length) await supabase.storage.from(bucket).remove(paths);
}

/**
 * Undoes a half-finished submission.
 *
 * There is no transaction spanning Postgres and object storage, so if the
 * files or the detail row fail after the advertisement is inserted, the
 * advertisement is deleted rather than left in the queue as something the
 * office would have to work out. The owner may delete their own row, so this
 * needs no special privilege.
 */
async function rollback(supabase: ServerClient, adId: string) {
  await supabase.from('ads').delete().eq('id', adId);
}

/** Blank answers are absent answers; an empty string in JSONB helps nobody. */
function compactAttributes(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    const trimmed = value.trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}
