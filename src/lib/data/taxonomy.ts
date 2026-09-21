import 'server-only';

import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CategoryRow, LocationRow } from '@/types/database';

export interface CategoryNode extends CategoryRow {
  children: CategoryRow[];
  liveAdCount: number;
}

export interface LocationNode extends LocationRow {
  children: LocationRow[];
}

/**
 * Top-level categories with their children and live ad counts.
 *
 * Two queries rather than a join: the counts come from a view that already
 * applies row-level security, and stitching in memory over a few dozen rows is
 * cheaper than a nested select.
 */
export const getCategoryTree = cache(async (): Promise<CategoryNode[]> => {
  if (!isSupabaseConfigured) return [];

  const supabase = await createSupabaseServerClient();

  const [categories, counts] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase.from('category_ad_counts').select('category_id, live_ad_count'),
  ]);

  if (categories.error) {
    throw new Error(`Could not load categories: ${categories.error.message}`);
  }

  const rows = categories.data ?? [];
  const countByCategory = new Map<string, number>(
    (counts.data ?? []).map((row) => [row.category_id as string, Number(row.live_ad_count ?? 0)]),
  );

  const childrenByParent = new Map<string, CategoryRow[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const siblings = childrenByParent.get(row.parent_id) ?? [];
    siblings.push(row);
    childrenByParent.set(row.parent_id, siblings);
  }

  return rows
    .filter((row) => row.parent_id === null)
    .map((row) => {
      const children = childrenByParent.get(row.id) ?? [];
      const ownCount = countByCategory.get(row.id) ?? 0;
      const childCount = children.reduce(
        (total, child) => total + (countByCategory.get(child.id) ?? 0),
        0,
      );
      return { ...row, children, liveAdCount: ownCount + childCount };
    });
});

/** Cities in the coverage area, each with its localities. */
export const getLocationTree = cache(async (): Promise<LocationNode[]> => {
  if (!isSupabaseConfigured) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`Could not load locations: ${error.message}`);

  const rows = data ?? [];
  const areasByCity = new Map<string, LocationRow[]>();
  for (const row of rows) {
    if (row.kind !== 'area' || !row.parent_id) continue;
    const siblings = areasByCity.get(row.parent_id) ?? [];
    siblings.push(row);
    areasByCity.set(row.parent_id, siblings);
  }

  return rows
    .filter((row) => row.kind === 'city')
    .map((row) => ({ ...row, children: areasByCity.get(row.id) ?? [] }));
});
