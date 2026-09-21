'use server';

import { revalidatePath } from 'next/cache';

import { NotSignedInError, requireUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { editEnvelopeSchema, isEditable, type EditResult } from '@/lib/post-ad/edit';
import {
  classifiedSubmissionSchema,
  displaySubmissionSchema,
  MAX_IMAGES,
} from '@/lib/post-ad/schema';
import {
  acceptUpload,
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  storagePath,
  UploadRejected,
  type AcceptedUpload,
} from '@/lib/post-ad/upload';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Correcting an advertisement that has already been sent.
 *
 * This is the other half of "request changes": the office asks for something
 * to be fixed, and this is where the advertiser fixes it. Without it that
 * decision asks somebody to do a thing they have no way of doing.
 *
 * Everything the submission action refuses, this refuses too, and for the same
 * reasons — it re-validates with the same zod schemas, takes the owner from a
 * verified token, and never accepts a status, a package, a price stamp or an
 * expiry from the request. Two things are specific to editing:
 *
 *  - The advertisement's CURRENT state decides whether it may be edited at
 *    all. A finished advertisement is not editable, because bringing one back
 *    is a renewal.
 *  - Sending it back is `status = 'pending'` and nothing else. The database
 *    clears the office's message on the way out of `rejected` or
 *    `changes_requested`, so nothing here has to remember to.
 */

const GENERIC_FAILURE =
  'We could not save that just now. Please try again in a moment.';

export async function updateAdvertisementAction(formData: FormData): Promise<EditResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      code: 'unavailable',
      message: 'The site is running without a database connection, so nothing can be saved.',
    };
  }

  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof NotSignedInError) {
      return { ok: false, code: 'auth', message: 'Please sign in to edit your advertisement.' };
    }
    throw error;
  }

  const raw = formData.get('payload');
  if (typeof raw !== 'string') return { ok: false, code: 'invalid', message: GENERIC_FAILURE };

  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, code: 'invalid', message: GENERIC_FAILURE };
  }

  const parsedEnvelope = editEnvelopeSchema.safeParse(envelope);
  if (!parsedEnvelope.success) {
    return { ok: false, code: 'invalid', message: GENERIC_FAILURE };
  }
  const { advertisementId, removeImageIds, resubmit } = parsedEnvelope.data;

  const supabase = await createSupabaseServerClient();

  /*
   * `owner_ads` filters on `user_id = auth.uid()` inside the database, so a
   * row coming back is proof of ownership. There is no `.eq('user_id', …)`
   * here to forget.
   */
  const { data: current } = await supabase
    .from('owner_ads')
    .select('id, kind, status, package_id')
    .eq('id', advertisementId)
    .maybeSingle();

  if (!current) {
    return { ok: false, code: 'invalid', message: 'That advertisement could not be found.' };
  }
  if (!isEditable(current.status)) {
    return {
      ok: false,
      code: 'not-editable',
      message:
        'This advertisement has finished its run. Our office can start it again for you — editing it here is not enough.',
    };
  }

  const newPhotos = formData.getAll('images').filter((f): f is File => f instanceof File);

  return current.kind === 'display'
    ? saveDisplay(supabase, advertisementId, envelope, current.status, resubmit)
    : saveClassified(supabase, {
        userId: user.id,
        advertisementId,
        payload: envelope,
        packageId: current.package_id,
        status: current.status,
        removeImageIds,
        newPhotos,
        resubmit,
      });
}

/* ----------------------------------------------------------- classified -- */

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function saveClassified(
  supabase: ServerClient,
  input: {
    userId: string;
    advertisementId: string;
    payload: Record<string, unknown>;
    packageId: string | null;
    status: string;
    removeImageIds: string[];
    newPhotos: File[];
    resubmit: boolean;
  },
): Promise<EditResult> {
  const { advertisementId, removeImageIds, newPhotos } = input;

  /*
   * Which photographs will exist after this save.
   *
   * The ids to remove are checked against this advertisement's own rows rather
   * than trusted, so a stray id from a browser removes nothing and, more to
   * the point, cannot delete a photograph from somebody else's advertisement.
   */
  const { data: existing } = await supabase
    .from('ad_images')
    .select('id, storage_path, sort_order')
    .eq('ad_id', advertisementId)
    .order('sort_order', { ascending: true });

  const rows = existing ?? [];
  const removing = rows.filter((row) => removeImageIds.includes(row.id));
  const keeping = rows.filter((row) => !removeImageIds.includes(row.id));
  const imageCount = keeping.length + newPhotos.length;

  if (imageCount > MAX_IMAGES) {
    return { ok: false, code: 'invalid', message: `Please keep to ${MAX_IMAGES} photographs.` };
  }

  // The same schema the submission form runs, with the package read from the
  // advertisement rather than from the request — an edit cannot change what
  // was bought.
  const parsed = classifiedSubmissionSchema.safeParse({
    ...input.payload,
    advertisementType: 'classified',
    imageCount,
    packageId: input.packageId ?? 'basic',
  });

  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid',
      message: 'Something is missing or not quite right. Please check the fields marked below.',
    };
  }
  const submission = parsed.data;

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
      newPhotos.map((file) => acceptUpload(file, PHOTO_TYPES, PHOTO_MAX_BYTES)),
    );
  } catch (error) {
    if (error instanceof UploadRejected) return { ok: false, code: 'upload', message: error.message };
    throw error;
  }

  const price = submission.price ? Number(submission.price) : null;
  const { contact } = submission;

  const { error } = await supabase
    .from('ads')
    .update({
      category_id: category,
      location_id: location,
      title: submission.title,
      description: submission.description,
      price,
      price_type: price === null ? 'on_call' : 'fixed',
      attributes: compactAttributes(submission.categorySpecificData),
      contact_name: contact.name,
      contact_phone: contact.phone,
      contact_whatsapp: contact.allowWhatsApp && contact.whatsapp ? contact.whatsapp : null,
      contact_email: contact.email || null,
      show_phone: contact.showPhonePublicly,
      show_whatsapp: contact.allowWhatsApp,
      // Sending it back is the whole of "resubmit". The guard clears the
      // office's message on the way out of rejected or changes_requested.
      ...(input.resubmit ? { status: 'pending' as const } : {}),
    })
    .eq('id', advertisementId);

  if (error) return { ok: false, code: 'failed', message: GENERIC_FAILURE };

  // Photographs last, and only once the row has saved: a picture removed
  // before a failed save is a picture the advertiser has lost for nothing.
  if (removing.length) {
    await supabase
      .from('ad_images')
      .delete()
      .in(
        'id',
        removing.map((row) => row.id),
      );
    await supabase.storage.from('ad-images').remove(removing.map((row) => row.storage_path));
  }

  if (accepted.length) {
    const startAt = keeping.length;
    const paths: string[] = [];

    for (const [index, file] of accepted.entries()) {
      const path = storagePath(input.userId, advertisementId, startAt + index, file.extension);
      const { error: uploadError } = await supabase.storage
        .from('ad-images')
        .upload(path, file.file, { contentType: file.contentType, upsert: false });

      if (uploadError) {
        if (paths.length) await supabase.storage.from('ad-images').remove(paths);
        return {
          ok: false,
          code: 'upload',
          message: `${file.originalName} could not be uploaded. Everything else has been saved.`,
        };
      }
      paths.push(path);
    }

    await supabase.from('ad_images').insert(
      paths.map((path, index) => ({
        ad_id: advertisementId,
        storage_path: path,
        sort_order: startAt + index,
      })),
    );
  }

  // Positions have to stay contiguous or the unique (ad_id, sort_order) index
  // refuses the next insert after a removal from the middle.
  if (removing.length) await renumber(supabase, advertisementId);

  revalidateAfterEdit(advertisementId);
  return { ok: true, redirectTo: '/my-ads' };
}

/* -------------------------------------------------------------- display -- */

async function saveDisplay(
  supabase: ServerClient,
  advertisementId: string,
  payload: Record<string, unknown>,
  _status: string,
  resubmit: boolean,
): Promise<EditResult> {
  const { count: artworkCount } = await supabase
    .from('ad_artwork')
    .select('id', { count: 'exact', head: true })
    .eq('ad_id', advertisementId);

  const parsed = displaySubmissionSchema.safeParse({
    ...payload,
    advertisementType: 'display',
    artworkCount: artworkCount ?? 0,
  });

  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid',
      message: 'Something is missing or not quite right. Please check the fields marked below.',
    };
  }
  const submission = parsed.data;

  const location = await lookupId(supabase, 'locations', submission.locationSlug);
  if (!location) return { ok: false, code: 'invalid', message: GENERIC_FAILURE };

  const { contact } = submission;

  const { error } = await supabase
    .from('ads')
    .update({
      location_id: location,
      title: submission.title,
      description: submission.description,
      contact_name: contact.name,
      contact_phone: contact.phone,
      contact_whatsapp: contact.allowWhatsApp && contact.whatsapp ? contact.whatsapp : null,
      contact_email: contact.email || null,
      show_phone: contact.showPhonePublicly,
      show_whatsapp: contact.allowWhatsApp,
      ...(resubmit ? { status: 'pending' as const } : {}),
    })
    .eq('id', advertisementId);

  if (error) return { ok: false, code: 'failed', message: GENERIC_FAILURE };

  const { error: detailError } = await supabase
    .from('display_ad_details')
    .update({
      organisation_name: submission.organisationName,
      website: submission.website || null,
      notes: submission.notes || null,
    })
    .eq('ad_id', advertisementId);

  if (detailError) return { ok: false, code: 'failed', message: GENERIC_FAILURE };

  revalidateAfterEdit(advertisementId);
  return { ok: true, redirectTo: '/my-ads' };
}

/* --------------------------------------------------------------- shared -- */

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

/**
 * Closes the gaps left by a removal.
 *
 * `ad_images` has a unique (ad_id, sort_order), so leaving 0, 2, 3 behind
 * means the next upload at position 1 collides with nothing but the one after
 * it does. Renumbering downwards, in order, never collides on the way.
 */
async function renumber(supabase: ServerClient, advertisementId: string) {
  const { data } = await supabase
    .from('ad_images')
    .select('id, sort_order')
    .eq('ad_id', advertisementId)
    .order('sort_order', { ascending: true });

  for (const [index, image] of (data ?? []).entries()) {
    if (image.sort_order === index) continue;
    await supabase.from('ad_images').update({ sort_order: index }).eq('id', image.id);
  }
}

function compactAttributes(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    const trimmed = value.trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

function revalidateAfterEdit(advertisementId: string) {
  revalidatePath('/my-ads');
  revalidatePath(`/my-ads/${advertisementId}/edit`);
  // An edit to a live advertisement takes it off the site, and an edit to one
  // in the queue changes what the office is about to read.
  revalidatePath('/classifieds', 'layout');
  revalidatePath('/admin/advertisements', 'layout');
  revalidatePath('/admin');
}
