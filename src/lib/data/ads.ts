import 'server-only';

import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AdRow, CategoryRow, LocationRow } from '@/types/database';

/** An ad joined with the pieces every listing card needs. */
export interface AdSummary
  extends Pick<
    AdRow,
    | 'id'
    | 'reference'
    | 'slug'
    | 'title'
    | 'price'
    | 'price_type'
    | 'is_featured'
    | 'published_at'
    | 'view_count'
  > {
  category: Pick<CategoryRow, 'name' | 'slug'> | null;
  location: Pick<LocationRow, 'name' | 'slug'> | null;
  coverImagePath: string | null;
}

/** Columns every listing card needs, joined with its taxonomy and cover image. */
const SUMMARY_SELECT = `
  id, reference, slug, title, price, price_type, is_featured, published_at, view_count,
  category:categories ( name, slug ),
  location:locations ( name, slug ),
  images:ad_images ( storage_path, sort_order )
` as const;

interface SummaryRow {
  id: string;
  reference: string;
  slug: string;
  title: string;
  price: number | null;
  price_type: AdRow['price_type'];
  is_featured: boolean;
  published_at: string | null;
  view_count: number;
  category: unknown;
  location: unknown;
  images: Array<{ storage_path: string; sort_order: number }> | null;
}

function toSummary(row: SummaryRow): AdSummary {
  const images = row.images ?? [];
  const cover = [...images].sort((a, b) => a.sort_order - b.sort_order)[0];
  return {
    id: row.id,
    reference: row.reference,
    slug: row.slug,
    title: row.title,
    price: row.price,
    price_type: row.price_type,
    is_featured: row.is_featured,
    published_at: row.published_at,
    view_count: row.view_count,
    category: (row.category as AdSummary['category']) ?? null,
    location: (row.location as AdSummary['location']) ?? null,
    coverImagePath: cover?.storage_path ?? null,
  };
}

/**
 * The public feed: live ads, featured first, newest next.
 *
 * Only approved and unexpired rows are visible, but that is enforced by the
 * row-level security policy rather than by this filter — the explicit
 * conditions here let Postgres use the partial index on the public feed.
 */
export const getLatestAds = cache(async (limit = 12): Promise<AdSummary[]> => {
  if (!isSupabaseConfigured) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('ads')
    .select(SUMMARY_SELECT)
    .eq('status', 'approved')
    .gt('expires_at', new Date().toISOString())
    .order('is_featured', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load advertisements: ${error.message}`);
  return ((data ?? []) as unknown as SummaryRow[]).map(toSummary);
});

/**
 * Keyword search over the generated `search_vector`.
 *
 * Uses the 'simple' text-search configuration to match the generated column:
 * ad copy is often Hindi, which English stemming would mangle.
 */
export const searchAds = cache(async (query: string, limit = 40): Promise<AdSummary[]> => {
  if (!isSupabaseConfigured) return [];

  const supabase = await createSupabaseServerClient();
  let request = supabase
    .from('ads')
    .select(SUMMARY_SELECT)
    .eq('status', 'approved')
    .gt('expires_at', new Date().toISOString());

  const trimmed = query.trim();
  if (trimmed) {
    request = request.textSearch('search_vector', trimmed, {
      type: 'websearch',
      config: 'simple',
    });
  }

  const { data, error } = await request
    .order('is_featured', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Search failed: ${error.message}`);
  return ((data ?? []) as unknown as SummaryRow[]).map(toSummary);
});

/** Total live advertisements, for the header stat and SEO copy. */
export const getLiveAdCount = cache(async (): Promise<number> => {
  if (!isSupabaseConfigured) return 0;

  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from('ads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .gt('expires_at', new Date().toISOString());

  if (error) throw new Error(`Could not count advertisements: ${error.message}`);
  return count ?? 0;
});
