import 'server-only';

import { cache } from 'react';

import { AD_PACKAGES, type AdvertisementPackageConfig } from '@/config/packages';
import { getLifecycleSettings } from '@/lib/data/lifecycle-settings';
import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The packages on sale, with how long each one runs.
 *
 * The database is the source: `packages.duration_days`, or the site default
 * when a package has none of its own. That is the same rule
 * `package_duration_days()` applies at approval time, so the length a renewal
 * page promises is the length the advertisement actually gets.
 */
export const getPackageConfigs = cache(async (): Promise<AdvertisementPackageConfig[]> => {
  const { defaultRunDays } = await getLifecycleSettings();

  if (!isSupabaseConfigured) {
    return AD_PACKAGES.map((item) => ({
      id: item.id,
      name: item.name,
      summary: item.summary,
      features: item.features,
      durationDays: defaultRunDays,
      usesDefaultDuration: true,
      price: item.price,
      featured: item.id === 'premium',
      priority: 0,
      maxImages: 8,
    }));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('packages')
    .select('id, name, summary, features, price_paise, duration_days, max_images, featured_eligible, priority, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    summary: row.summary,
    features: Array.isArray(row.features) ? row.features.map(String) : [],
    durationDays: row.duration_days ?? defaultRunDays,
    usesDefaultDuration: row.duration_days === null,
    price: row.price_paise,
    featured: row.featured_eligible,
    priority: row.priority ?? 0,
    maxImages: row.max_images,
  }));
});
