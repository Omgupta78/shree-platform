import 'server-only';

import { cache } from 'react';

import {
  DEFAULT_EXPIRING_SOON_DAYS,
  DEFAULT_MAX_EXTENSION_DAYS,
  DEFAULT_RUN_DAYS,
} from '@/config/lifecycle';
import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LifecycleSettings {
  expiringSoonDays: number;
  defaultRunDays: number;
  maxExtensionDays: number;
}

const FALLBACK: LifecycleSettings = {
  expiringSoonDays: DEFAULT_EXPIRING_SOON_DAYS,
  defaultRunDays: DEFAULT_RUN_DAYS,
  maxExtensionDays: DEFAULT_MAX_EXTENSION_DAYS,
};

const KEYS: Record<string, keyof LifecycleSettings> = {
  'ads.expiring_soon_days': 'expiringSoonDays',
  'ads.default_duration_days': 'defaultRunDays',
  'ads.max_extension_days': 'maxExtensionDays',
};

/**
 * The lifecycle numbers, from the same `app_settings` rows the database
 * functions read — so "expiring soon" on a page and "due for renewal" in
 * `request_renewal()` can never disagree.
 */
export const getLifecycleSettings = cache(async (): Promise<LifecycleSettings> => {
  if (!isSupabaseConfigured) return FALLBACK;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', Object.keys(KEYS));
  if (error || !data) return FALLBACK;

  const settings = { ...FALLBACK };
  for (const row of data) {
    const key = KEYS[row.key];
    const value = Number(row.value);
    if (key && Number.isInteger(value) && value > 0) settings[key] = value;
  }
  return settings;
});
