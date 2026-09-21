import 'server-only';

import { cache } from 'react';
import { z } from 'zod';

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
