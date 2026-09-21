'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { NotStaffError, requireAdministrator, requireStaff } from '@/lib/admin/guard';
import {
  MAX_NOTE,
  bulkModerationInputSchema,
  moderationInputSchema,
} from '@/lib/admin/moderation';
import { isSupabaseConfigured } from '@/lib/env';
import { renewalMessageFor } from '@/lib/lifecycle/messages';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Every write the office can make.
 *
 * None of these is an UPDATE against a table. Each one calls a database
 * function that re-checks the role, re-checks that the move is permitted, and
 * writes the audit entry in the same transaction as the change itself. That
 * matters for a specific reason: PostgREST gives each request its own
 * transaction, so a decision sent as one call and its explanation sent as
 * another can come apart — leaving either a status change nobody can account
 * for, or a note about a change that never happened.
 *
 * The checks in this file are therefore for the interface's benefit, not the
 * database's. A malicious client calling these actions directly still has to
 * get past `is_staff()` inside Postgres, and posting `action: "approve"` at an
 * advertisement is refused there whatever this file believes.
 */

export interface AdminActionResult {
  ok: boolean;
  message?: string;
  /** How many rows a bulk action actually changed. */
  count?: number;
  /** Filled when some of a bulk action failed, so the office can see which. */
  failures?: Array<{ reference: string; message: string }>;
}

const UNAVAILABLE: AdminActionResult = {
  ok: false,
  message: 'The site is running without a database connection.',
};

function refusal(error: unknown): AdminActionResult {
  if (error instanceof NotStaffError) return { ok: false, message: error.message };
  return {
    ok: false,
    message: 'That could not be saved just now. Please try again in a moment.',
  };
}

/**
 * Postgres raises with a message written for the person reading it — "An
 * advertisement cannot go from rejected to approved", "A reason is required to
 * reject an advertisement". Those are better than anything this layer could
 * invent, so they are passed through. Anything else is not: an internal error
 * text is not an explanation.
 */
function messageFor(error: { message?: string; code?: string } | null): string {
  const raw = error?.message ?? '';
  const known =
    /cannot go from|reason is required|Only Shree Classified|Only an administrator|No such|Unknown moderation|correction needs a note/i.test(raw);
  return known
    ? raw
    : 'That could not be saved just now. Please try again in a moment.';
}

/* ------------------------------------------------------- moderation -- */

export async function moderateAdvertisementAction(input: {
  advertisementId: string;
  action: string;
  note: string;
}): Promise<AdminActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;

  try {
    await requireStaff();
  } catch (error) {
    return refusal(error);
  }

  const parsed = moderationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'That is not a decision this office can record.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('moderate_advertisement', {
    p_ad_id: parsed.data.advertisementId,
    p_action: parsed.data.action,
    p_note: parsed.data.note || null,
  });

  if (error) return { ok: false, message: messageFor(error) };

  revalidateAdminAndPublic(parsed.data.advertisementId);
  return { ok: true, count: 1 };
}

/* -------------------------------------------------------- lifecycle -- */

const renewalDecisionSchema = z.object({
  renewalId: z.uuid(),
  note: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(MAX_NOTE, `Please keep this to ${MAX_NOTE} characters or fewer.`)),
});

/**
 * Approving a renewal. Staff — a review decision like any other. The new
 * run is calculated by `approve_renewal()`, never sent from here.
 */
export async function approveRenewalAction(input: {
  renewalId: string;
  note: string;
}): Promise<AdminActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;
  try {
    await requireStaff();
  } catch (error) {
    return refusal(error);
  }
  const parsed = renewalDecisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'That is not a renewal this office can decide.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('approve_renewal', {
    p_renewal_id: parsed.data.renewalId,
    p_note: parsed.data.note || null,
  });
  if (error) return { ok: false, message: renewalMessageFor(error) };

  revalidateAdminAndPublic();
  return { ok: true, count: 1 };
}

export async function rejectRenewalAction(input: {
  renewalId: string;
  note: string;
}): Promise<AdminActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;
  try {
    await requireStaff();
  } catch (error) {
    return refusal(error);
  }
  const parsed = renewalDecisionSchema.safeParse(input);
  if (!parsed.success || !parsed.data.note) {
    return { ok: false, message: 'Please give the advertiser a reason.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('reject_renewal', {
    p_renewal_id: parsed.data.renewalId,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, message: renewalMessageFor(error) };

  revalidateAdminAndPublic();
  return { ok: true, count: 1 };
}

const extendSchema = z.object({
  advertisementId: z.uuid(),
  // A calendar date from a date input. The instant is built here, as the end
  // of that day in India, with an explicit offset — never by adding hours.
  newExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please choose a date.'),
  reason: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1, 'Please give a reason.').max(MAX_NOTE)),
});

/**
 * Extending a live run. Administrators only — checked here for a clear
 * message and again in `extend_advertisement_expiry()`, which is what
 * actually refuses a moderator. The date is validated there too: later than
 * the current expiry, and within the configured ceiling.
 */
export async function extendExpiryAction(input: {
  advertisementId: string;
  newExpiryDate: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;
  try {
    await requireAdministrator();
  } catch (error) {
    return refusal(error);
  }
  const parsed = extendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const instant = new Date(`${parsed.data.newExpiryDate}T23:59:59+05:30`);
  if (Number.isNaN(instant.getTime())) return { ok: false, message: 'That is not a valid date.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('extend_advertisement_expiry', {
    p_ad_id: parsed.data.advertisementId,
    p_new_expires_at: instant.toISOString(),
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: renewalMessageFor(error) };

  revalidateAdminAndPublic(parsed.data.advertisementId);
  return { ok: true, count: 1 };
}

/** "Run the expiry check now" — the same idempotent sweep the scheduler calls. */
export async function runExpirySweepAction(): Promise<AdminActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;
  try {
    await requireStaff();
  } catch (error) {
    return refusal(error);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('expire_advertisements');
  if (error) return { ok: false, message: renewalMessageFor(error) };
  revalidateAdminAndPublic();
  return { ok: true, count: Number(data ?? 0) };
}

/* ------------------------------------------------------- correction -- */

const correctionInputSchema = z.object({
  advertisementId: z.uuid(),
  title: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(5, 'The title needs at least 5 characters.').max(120)),
  description: z
    .string()
    .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(z.string().max(5000, 'Please keep the description to 5,000 characters or fewer.')),
  categorySlug: z.string().max(80),
  locationSlug: z.string().min(1, 'Choose a location.').max(80),
  note: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(
      z
        .string()
        .min(1, 'Say what you changed and why — it goes in the history.')
        .max(MAX_NOTE, `Please keep the note to ${MAX_NOTE} characters or fewer.`),
    ),
});

/**
 * A staff correction: title, description, category, location.
 *
 * Deliberately not price, contact details or photographs — those are the
 * advertiser's to change, and a moderator who could rewrite a telephone number
 * could redirect every enquiry. Goes through `correct_advertisement()`, which
 * re-checks the role, requires the note, and writes the audit entry with it.
 * It does not change the status: correcting a pending advertisement leaves it
 * pending, and approving it is still a separate decision.
 */
export async function correctAdvertisementAction(input: {
  advertisementId: string;
  title: string;
  description: string;
  categorySlug: string;
  locationSlug: string;
  note: string;
}): Promise<AdminActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;

  try {
    await requireStaff();
  } catch (error) {
    return refusal(error);
  }

  const parsed = correctionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const data = parsed.data;

  const supabase = await createSupabaseServerClient();
  const [category, location] = await Promise.all([
    data.categorySlug
      ? supabase.from('categories').select('id').eq('slug', data.categorySlug).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('locations').select('id').eq('slug', data.locationSlug).maybeSingle(),
  ]);

  if (data.categorySlug && !category.data) {
    return { ok: false, message: 'That category does not exist.' };
  }
  if (!location.data) return { ok: false, message: 'That location does not exist.' };

  const { error } = await supabase.rpc('correct_advertisement', {
    p_ad_id: data.advertisementId,
    p_title: data.title,
    p_description: data.description,
    p_category_id: category.data?.id ?? null,
    p_location_id: location.data.id,
    p_note: data.note,
  });

  if (error) {
    // Length and "classified needs a category" are check constraints; say so
    // in words rather than passing the constraint name through.
    if (error.code === '23514') {
      return {
        ok: false,
        message:
          'The database refused that — check the title and description lengths, and that a classified advertisement has a category.',
      };
    }
    return { ok: false, message: messageFor(error) };
  }

  revalidateAdminAndPublic(data.advertisementId);
  return { ok: true, count: 1 };
}

/**
 * The same decision, applied to a selection.
 *
 * Sequential, not `Promise.all`. Twenty-five simultaneous round trips against
 * one Postgres connection pool is a good way to make the slowest one time out,
 * and more to the point each call has to be able to fail on its own: the point
 * of the failures list is that the office can see which three of the
 * twenty-five were refused and why, rather than being told the batch did not
 * work.
 */
export async function bulkModerateAction(input: {
  advertisementIds: string[];
  action: string;
  note: string;
}): Promise<AdminActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;

  try {
    await requireStaff();
  } catch (error) {
    return refusal(error);
  }

  const parsed = bulkModerationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Please choose up to 25 advertisements and an action.' };
  }
  if (parsed.data.action === 'reject' && !parsed.data.note) {
    return { ok: false, message: 'A reason is needed to reject advertisements.' };
  }

  const supabase = await createSupabaseServerClient();
  const failures: Array<{ reference: string; message: string }> = [];
  let count = 0;

  for (const id of parsed.data.advertisementIds) {
    const { error } = await supabase.rpc('moderate_advertisement', {
      p_ad_id: id,
      p_action: parsed.data.action,
      p_note: parsed.data.note || null,
    });

    if (error) {
      const { data } = await supabase
        .from('moderation_ads')
        .select('reference')
        .eq('id', id)
        .maybeSingle();
      failures.push({ reference: data?.reference ?? id.slice(0, 8), message: messageFor(error) });
    } else {
      count += 1;
    }
  }

  revalidateAdminAndPublic();

  return {
    ok: failures.length === 0,
    count,
    failures: failures.length ? failures : undefined,
    message: failures.length
      ? `${count} done, ${failures.length} could not be changed.`
      : undefined,
  };
}

/* ---------------------------------------------------------- reports -- */

const reportInputSchema = z.object({
  reportId: z.uuid(),
  status: z.enum(['reviewing', 'actioned', 'dismissed']),
  note: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(500)),
});

export async function resolveReportAction(input: {
  reportId: string;
  status: string;
  note: string;
}): Promise<AdminActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;

  try {
    await requireStaff();
  } catch (error) {
    return refusal(error);
  }

  const parsed = reportInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'That is not something that can be done to a report.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('resolve_ad_report', {
    p_report_id: parsed.data.reportId,
    p_status: parsed.data.status,
    p_note: parsed.data.note || null,
  });

  if (error) return { ok: false, message: messageFor(error) };

  revalidatePath('/admin/reports');
  revalidatePath('/admin');
  return { ok: true, count: 1 };
}

/* ------------------------------------------------------------ users -- */

const blockInputSchema = z.object({ userId: z.uuid(), blocked: z.boolean() });

/**
 * Blocking an account.
 *
 * The one thing this interface can do to a person, and it is an
 * administrator's to do. There is deliberately no control anywhere in the
 * admin pages that grants a role: an interface that can make somebody an
 * administrator is an interface that can be tricked into making somebody an
 * administrator, and the office needs to do it roughly once. It is done in the
 * Supabase SQL editor, which the schema treats as a trusted connection — the
 * same route by which the first administrator exists at all.
 */
export async function setUserBlockedAction(input: {
  userId: string;
  blocked: boolean;
}): Promise<AdminActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;

  let administrator;
  try {
    administrator = await requireAdministrator();
  } catch (error) {
    return refusal(error);
  }

  const parsed = blockInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'That account could not be found.' };

  if (parsed.data.userId === administrator.id) {
    return { ok: false, message: 'You cannot block your own account.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('profiles')
    .update({ is_blocked: parsed.data.blocked })
    .eq('id', parsed.data.userId);

  if (error) return { ok: false, message: messageFor(error) };

  revalidatePath('/admin/users');
  return { ok: true, count: 1 };
}

/* ------------------------------------------------------- categories -- */

const categoryInputSchema = z.object({
  id: z.uuid().optional(),
  parentId: z.union([z.uuid(), z.literal('')]).optional(),
  name: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(2, 'Please give the category a name.').max(60)),
  slug: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(
      z
        .string()
        .regex(
          /^[a-z0-9]+(-[a-z0-9]+)*$/,
          'A slug is lowercase letters, numbers and single hyphens.',
        ),
    ),
  description: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(300)),
  sortOrder: z.number().int().min(0).max(9999),
  isActive: z.boolean(),
});

export async function saveCategoryAction(input: {
  id?: string;
  parentId?: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}): Promise<AdminActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;

  try {
    await requireAdministrator();
  } catch (error) {
    return refusal(error);
  }

  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'That category could not be saved.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const row = {
    parent_id: parsed.data.parentId || null,
    slug: parsed.data.slug,
    name: parsed.data.name,
    description: parsed.data.description || null,
    sort_order: parsed.data.sortOrder,
    is_active: parsed.data.isActive,
  };

  const { error } = parsed.data.id
    ? await supabase.from('categories').update(row).eq('id', parsed.data.id)
    : await supabase.from('categories').insert(row);

  if (error) {
    // The slug is unique in the schema, which is the only failure worth
    // naming: everything else here is the office's own typing.
    if (error.code === '23505') {
      return { ok: false, message: 'Another category already uses that slug.' };
    }
    return { ok: false, message: messageFor(error) };
  }

  revalidatePath('/admin/categories');
  revalidatePath('/categories');
  revalidatePath('/classifieds');
  return { ok: true, count: 1 };
}

/*
 * There is no delete.
 *
 * A category with advertisements in it cannot be removed without deciding what
 * happens to them, and the schema says so — `categories` is referenced with ON
 * DELETE RESTRICT. Deactivating hides it from the public site and from the
 * submission form while leaving every advertisement where it is, which is what
 * "remove this category" almost always means in practice.
 */

/* ----------------------------------------------------- revalidation -- */

function revalidateAdminAndPublic(advertisementId?: string) {
  revalidatePath('/admin');
  revalidatePath('/admin/advertisements', 'layout');
  if (advertisementId) revalidatePath(`/admin/advertisements/${advertisementId}`);

  // Approving makes something public, and unpublishing takes it away again.
  // Both have to reach the reading side or the office will be looking at a
  // decision the site has not caught up with.
  revalidatePath('/classifieds', 'layout');
  revalidatePath('/');
  revalidatePath('/my-ads');
}
