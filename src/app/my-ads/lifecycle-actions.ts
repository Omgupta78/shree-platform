'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { NotSignedInError, requireUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { renewalMessageFor } from '@/lib/lifecycle/messages';
import { isChargeable } from '@/lib/payments/amounts';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Asking for a renewal.
 *
 * Two values come from the browser: which advertisement, and which package.
 * Neither is trusted. The id is checked for shape here and for ownership in
 * the database — `request_renewal()` answers a stranger's id exactly as it
 * answers a made-up one. The package is checked against the packages on sale,
 * also in the database. Status, dates and price are not parameters at all, so
 * there is nothing to manipulate: the function decides whether the
 * advertisement is due, and approval decides the new run.
 */

export interface RenewalResult {
  ok: boolean;
  message?: string;
  /** 'review' when it went back to the queue, 'live' when it stays up meanwhile. */
  outcome?: 'review' | 'live';
  /** The renewal just created. A payment is raised against this, not the advertisement. */
  renewalId?: string;
  /**
   * True when the chosen package carries a rate to collect.
   *
   * Read from the `packages` row, not from anything the browser sent. The
   * database refuses to approve a priced renewal that has not been paid for,
   * so this only decides whether a checkout is offered — it is not the rule.
   */
  paymentDue?: boolean;
}

const inputSchema = z.object({
  advertisementId: z.uuid(),
  packageId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
});

export async function requestRenewalAction(input: {
  advertisementId: string;
  packageId: string;
}): Promise<RenewalResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'The site is running without a database connection.' };
  }

  try {
    await requireUser();
  } catch (error) {
    if (error instanceof NotSignedInError) {
      return { ok: false, message: 'Please sign in again to renew this advertisement.' };
    }
    throw error;
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Please choose a package.' };

  const supabase = await createSupabaseServerClient();
  const { data: renewalId, error } = await supabase.rpc('request_renewal', {
    p_ad_id: parsed.data.advertisementId,
    p_package_id: parsed.data.packageId,
  });
  if (error) return { ok: false, message: renewalMessageFor(error) };

  const [{ data }, { data: pkg }] = await Promise.all([
    supabase
      .from('owner_ads')
      .select('status')
      .eq('id', parsed.data.advertisementId)
      .maybeSingle(),
    supabase
      .from('packages')
      .select('price_paise')
      .eq('id', parsed.data.packageId)
      .maybeSingle(),
  ]);

  revalidatePath('/my-ads', 'layout');
  revalidatePath('/admin', 'layout');
  return {
    ok: true,
    outcome: data?.status === 'approved' ? 'live' : 'review',
    renewalId: renewalId ?? undefined,
    paymentDue: isChargeable(pkg?.price_paise ?? null),
  };
}
