'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { NotStaffError, requireAdministrator } from '@/lib/admin/guard';
import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Setting the rates.
 *
 * An administrator's business, and only theirs: `packages_write` is
 * `is_admin()`, so a moderator's attempt changes nothing however this action
 * is reached. `requireAdministrator()` here is the courteous refusal, not the
 * enforcement.
 *
 * Changing a price does NOT change what anybody has already paid. Every
 * payment carries its own `amount_paise`, `package_name` and
 * `package_duration_days`, copied when the order was raised, so an old
 * receipt still reads ₹199 for Standard after Standard becomes ₹249. That is
 * asserted in `supabase/test/payment_checks.sql` rather than left as an
 * intention.
 *
 * What a price change does affect is advertisements not yet paid for. That is
 * the correct behaviour — the rate is quoted at the moment of sale — and it is
 * why the page says so above the form.
 */

export interface PackageUpdateResult {
  ok: boolean;
  message?: string;
}

const schema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
  name: z.string().trim().min(2).max(60),
  summary: z.string().trim().min(2).max(200),
  /**
   * Rupees as typed, converted to paise here. Empty means "no rate quoted",
   * which is not the same as free and is stored as NULL.
   */
  priceRupees: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{1,7}(\.\d{1,2})?$/.test(value), {
      message: 'A price is a number of rupees, with at most two decimal places.',
    }),
  durationDays: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{1,3}$/.test(value)),
  maxImages: z.coerce.number().int().min(0).max(20),
  featured: z.boolean(),
  priority: z.coerce.number().int().min(0).max(100),
  isActive: z.boolean(),
});

export async function updatePackageAction(formData: FormData): Promise<PackageUpdateResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'The site is running without a database connection.' };
  }

  try {
    await requireAdministrator();
  } catch (error) {
    if (error instanceof NotStaffError) return { ok: false, message: error.message };
    throw error;
  }

  const parsed = schema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    summary: formData.get('summary'),
    priceRupees: formData.get('priceRupees'),
    durationDays: formData.get('durationDays'),
    maxImages: formData.get('maxImages'),
    featured: formData.get('featured') === 'on',
    priority: formData.get('priority'),
    isActive: formData.get('isActive') === 'on',
  });

  if (!parsed.success) {
    return { ok: false, message: 'Please check the figures and try again.' };
  }
  const input = parsed.data;

  // Money is held in paise so it is never a float. The conversion rounds
  // rather than truncates, so 199.995 becomes 20000 rather than 19999.
  const pricePaise =
    input.priceRupees === '' ? null : Math.round(Number(input.priceRupees) * 100);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('packages')
    .update({
      name: input.name,
      summary: input.summary,
      price_paise: pricePaise,
      duration_days: input.durationDays === '' ? null : Number(input.durationDays),
      max_images: input.maxImages,
      featured_eligible: input.featured,
      priority: input.priority,
      is_active: input.isActive,
    })
    .eq('id', input.id);

  if (error) {
    return { ok: false, message: 'That change could not be saved.' };
  }

  revalidatePath('/admin/packages');
  revalidatePath('/post-ad');
  return { ok: true, message: `${input.name} saved.` };
}
