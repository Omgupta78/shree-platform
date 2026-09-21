import 'server-only';

import { cache } from 'react';
import { z } from 'zod';

import { SITE } from '@/config/site';
import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Site configuration lives in the `app_settings` table so the office phone
 * number, address or ad duration can change without a deployment.
 */
const settingsSchema = z.object({
  legal_name: z.string().default('Shree Advertising & Marketing'),
  brand_name: z.string().default('Shree Classified'),
  tagline: z.string().default(''),
  address: z.string().default(''),
  phones: z.array(z.string()).default([]),
  whatsapp: z.string().default(''),
  email: z.string().default(''),
  print_day: z.string().default('Saturday'),
});

export type SiteSettings = z.infer<typeof settingsSchema>;

/** Used before the database is connected, and if a row is missing. */
export const FALLBACK_SETTINGS: SiteSettings = settingsSchema.parse({});

/**
 * Reads every `site.*` setting in one query.
 * `cache` deduplicates this across a single render pass.
 */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  if (!isSupabaseConfigured) return FALLBACK_SETTINGS;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .like('key', 'site.%');

  if (error || !data) return FALLBACK_SETTINGS;

  const raw: Record<string, unknown> = {};
  for (const row of data) {
    raw[row.key.replace(/^site\./, '')] = row.value;
  }

  // A malformed row must not take the whole page down.
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : FALLBACK_SETTINGS;
});

/**
 * The office's own details, as the footer prints them.
 *
 * `app_settings` is the source and `config/site.ts` is the fallback, in that
 * order, field by field. The fallback matters: `FALLBACK_SETTINGS` above
 * defaults the address, telephone numbers and email to empty strings, which is
 * right for a schema and wrong for a footer — an unset row must not blank out
 * the address printed in the paper.
 *
 * This is what makes the architecture note true. Until now the footer read
 * `SITE` directly, so changing the office telephone number meant a
 * deployment, whatever the README said. Now it is an UPDATE, and the constants
 * are what the site falls back to rather than what it shows.
 */
export interface OfficeDetails {
  legalName: string;
  address: string;
  phones: readonly string[];
  whatsapp: string;
  email: string;
}

export const getOfficeDetails = cache(async (): Promise<OfficeDetails> => {
  const settings = await getSiteSettings();
  return {
    legalName: settings.legal_name || SITE.publisher,
    address: settings.address || SITE.address,
    phones: settings.phones.length > 0 ? settings.phones : SITE.phones,
    whatsapp: settings.whatsapp || SITE.whatsapp,
    email: settings.email || SITE.email,
  };
});
