'use server';

import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * What a reader can do to an advertisement they are looking at: report it, and
 * be counted as having seen it.
 *
 * Neither needs an account. Requiring one to report would mean the
 * advertisements most worth reporting are the ones nobody reports, and
 * requiring one to be counted would make the view figure a measure of how many
 * readers happen to be signed in.
 */

const REASONS = ['spam', 'fraud', 'incorrect', 'offensive', 'unavailable', 'other'] as const;

const reportSchema = z.object({
  advertisementId: z.uuid(),
  reason: z.enum(REASONS),
  details: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(1000, 'Please keep the note to 1000 characters or fewer.')),
});

export interface ReportResult {
  ok: boolean;
  message?: string;
}

export async function reportAdvertisementAction(input: {
  advertisementId: string;
  reason: string;
  details: string;
}): Promise<ReportResult> {
  if (!isSupabaseConfigured) {
    // Nothing to write to. Say so rather than showing a thank-you for a report
    // that went nowhere.
    return {
      ok: false,
      message: 'Reporting is not available yet on this installation.',
    };
  }

  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Please choose a reason for the report.' };
  }

  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from('ad_reports').insert({
    ad_id: parsed.data.advertisementId,
    // From the verified token, or null. A report cannot be filed in someone
    // else's name: the policy checks this against auth.uid() as well.
    reporter_id: user?.id ?? null,
    reason: parsed.data.reason,
    details: parsed.data.details || null,
  });

  if (error) {
    // A signed-in reader reporting the same advertisement twice trips the
    // one-per-reader index. That is not a failure worth alarming them about —
    // their report is already in the queue.
    if (error.code === '23505') return { ok: true };

    return {
      ok: false,
      message: 'We could not record that just now. Please try again in a moment.',
    };
  }

  return { ok: true };
}

/**
 * Counts a view.
 *
 * Called from the browser once the advertisement is on screen, rather than
 * during the server render. A render happens for prefetches, for metadata
 * generation and for whatever else visits the route; a reader looking at the
 * page is the thing the advertiser is being told about, and that is a browser
 * event.
 *
 * The increment itself is `record_ad_view()`, a SECURITY DEFINER function: an
 * anonymous reader has no right to update an advertisement and is not given
 * one. See migration 0007.
 */
export async function recordAdvertisementViewAction(advertisementId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  if (!z.uuid().safeParse(advertisementId).success) return;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc('record_ad_view', { p_ad_id: advertisementId });
}
