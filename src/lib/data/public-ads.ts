import 'server-only';

import { cache } from 'react';

import { PER_PAGE, type AdQuery } from '@/lib/classifieds/query';
import type { Page } from '@/lib/classifieds/filter';
import { createSupabaseAnonClient } from '@/lib/supabase/public';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { publicImageUrl } from '@/lib/storage';
import type { AdAttributes, Advertisement, AdvertisementFormat } from '@/types/content';
import type { PublicAdRow } from '@/types/database';

/**
 * Reading advertisements from the database.
 *
 * Everything here goes through `public_ads`, and that is the point: the view
 * applies "approved and not expired" in SQL, returns NULL for a telephone
 * number the advertiser chose not to publish, and does not carry a contact
 * email at any consent level. This module could not show a withheld number if
 * it tried, because it is never handed one.
 *
 * The filters in `lib/classifieds/filter.ts` were written as pure predicates
 * to be the specification for exactly this file; each one below is the
 * translation of the predicate with the same name. What is different is where
 * the work happens: there the whole dataset was in memory, here Postgres
 * filters, sorts and pages, and twelve rows come back.
 */

const LIST_COLUMNS = `
  id, reference, slug, kind, title, description, price, price_type, attributes,
  category_slug, location_slug, contact_name, contact_phone, contact_whatsapp,
  is_featured, published_at, updated_at, expires_at, view_count,
  image_count, cover_image_path, format
` as const;

type ListRow = Pick<
  PublicAdRow,
  | 'id'
  | 'reference'
  | 'slug'
  | 'kind'
  | 'title'
  | 'description'
  | 'price'
  | 'price_type'
  | 'attributes'
  | 'category_slug'
  | 'location_slug'
  | 'contact_name'
  | 'contact_phone'
  | 'contact_whatsapp'
  | 'is_featured'
  | 'published_at'
  | 'updated_at'
  | 'expires_at'
  | 'view_count'
  | 'image_count'
  | 'cover_image_path'
  | 'format'
>;

/**
 * The card summary.
 *
 * The first paragraph, cut at a word boundary. Not a separate column, because
 * a summary an advertiser has to write twice is a summary that drifts from the
 * advertisement it summarises.
 */
function summarise(description: string, limit = 180): string {
  const firstParagraph = description.split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').trim() ?? '';
  if (firstParagraph.length <= limit) return firstParagraph;
  const cut = firstParagraph.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** JSONB comes back as `unknown`; the detail page renders strings and numbers. */
function toAttributes(value: unknown): AdAttributes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' || typeof raw === 'number') out[key] = raw;
  }
  return out;
}

function toAdvertisement(row: ListRow, images: string[] = []): Advertisement {
  const published = row.published_at ?? row.updated_at;
  const cover = publicImageUrl(row.cover_image_path);

  return {
    id: row.id,
    reference: row.reference,
    slug: row.slug,
    title: row.title,
    summary: summarise(row.description),
    description: row.description,
    categorySlug: row.category_slug ?? '',
    locationSlug: row.location_slug ?? '',
    price: row.price,
    priceType: row.price_type,
    format: row.format as AdvertisementFormat,
    isFeatured: row.is_featured,
    // The view returns approved rows only, so this is a statement of fact
    // rather than a value read from the row.
    status: 'approved',
    publishedAt: published,
    // "Updated" means edited since publication, not touched by a counter.
    updatedAt: row.updated_at > published ? row.updated_at : null,
    expiresAt: row.expires_at,
    images: images.length ? images : cover ? [cover] : [],
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactWhatsapp: row.contact_whatsapp,
    // Never published. The column is not in the view.
    contactEmail: null,
    // Profiles are private, so "advertising since" would mean reading another
    // person's account record to decorate a card. It is left unanswered.
    advertiserSince: null,
    attributes: toAttributes(row.attributes),
  };
}

/* ------------------------------------------------------------ querying -- */

/**
 * One page of advertisements.
 *
 * Paging is `range()` with an exact count rather than fetching everything and
 * slicing, so a category with four thousand advertisements costs the same as
 * one with four.
 */
export async function queryPublicAdvertisements(query: AdQuery): Promise<Page<Advertisement>> {
  const supabase = await createSupabaseServerClient();

  let request = supabase.from('public_ads').select(LIST_COLUMNS, { count: 'exact' });

  if (query.category) request = request.eq('category_slug', query.category);
  if (query.location) request = request.eq('location_slug', query.location);

  if (query.type === 'featured') {
    request = request.eq('is_featured', true);
  } else if (query.type) {
    request = request.eq('format', query.type);
  }

  // A price range excludes an advertisement with no figure at all, exactly as
  // the in-memory predicate does: an "on call" advertisement cannot answer the
  // question the reader asked.
  if (query.minPrice !== null || query.maxPrice !== null) {
    request = request.not('price', 'is', null);
    if (query.minPrice !== null) request = request.gte('price', query.minPrice);
    if (query.maxPrice !== null) request = request.lte('price', query.maxPrice);
  }

  if (query.postedWithinDays) {
    const cutoff = new Date(Date.now() - query.postedWithinDays * 86_400_000);
    request = request.gte('published_at', cutoff.toISOString());
  }

  // Only facet keys declared for the category reach this far — `parseAdQuery`
  // drops the rest — so this cannot become an arbitrary attributes probe.
  for (const [key, value] of Object.entries(query.facets)) {
    request = request.contains('attributes', { [key]: value });
  }

  if (query.q) {
    // 'simple', matching the generated column: ad copy is frequently Hindi,
    // which English stemming would mangle.
    request = request.textSearch('search_vector', query.q, {
      type: 'websearch',
      config: 'simple',
    });
  }

  const page = Math.max(1, query.page);
  const from = (page - 1) * PER_PAGE;

  // Ordering is written out rather than pushed through a helper: the builder's
  // type changes with each `order()` call, and a generic wrapper around it
  // costs more in casts than it saves in lines.
  const sorted =
    query.sort === 'oldest'
      ? request.order('published_at', { ascending: true })
      : query.sort === 'price-asc'
        ? request
            .order('price', { ascending: true, nullsFirst: false })
            .order('published_at', { ascending: false })
        : query.sort === 'price-desc'
          ? request
              .order('price', { ascending: false, nullsFirst: false })
              .order('published_at', { ascending: false })
          : query.sort === 'featured'
            ? request
                .order('is_featured', { ascending: false })
                .order('published_at', { ascending: false })
            : request.order('published_at', { ascending: false });

  const { data, count, error } = await sorted.range(from, from + PER_PAGE - 1);

  if (error) throw new Error(`Could not load advertisements: ${error.message}`);

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

  return {
    items: ((data ?? []) as unknown as ListRow[]).map((row) => toAdvertisement(row)),
    total,
    page: Math.min(page, pageCount),
    pageCount,
    perPage: PER_PAGE,
  };
}

/** One advertisement, with its full gallery. Null when it is not public. */
export const getPublicAdvertisementBySlug = cache(
  async (slug: string): Promise<Advertisement | null> => {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from('public_ads')
      .select(LIST_COLUMNS)
      .eq('slug', slug)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as unknown as ListRow;
    const images = row.image_count > 0 ? await getImageUrls(row.id) : [];
    return toAdvertisement(row, images);
  },
);

async function getImageUrls(adId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('ad_images')
    .select('storage_path, sort_order')
    .eq('ad_id', adId)
    .order('sort_order', { ascending: true });

  return (data ?? [])
    .map((image) => publicImageUrl(image.storage_path))
    .filter((url): url is string => Boolean(url));
}

/** Live advertisement count per category slug, for the category index. */
export const countPublicByCategory = cache(
  async (): Promise<Readonly<Record<string, number>>> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('category_ad_counts')
      .select('slug, live_ad_count');

    if (error) return {};

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.slug as string] = Number(row.live_ad_count ?? 0);
    }
    return counts;
  },
);

export const countPublicAdvertisements = cache(async (): Promise<number> => {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from('public_ads')
    .select('id', { count: 'exact', head: true });

  if (error) return 0;
  return count ?? 0;
});

/**
 * Every slug that should be reachable, for the sitemap.
 *
 * Capped, because a sitemap is not a database export and Google will not thank
 * anyone for a single file with fifty thousand URLs in it.
 */
export async function getPublicAdvertisementSlugs(limit = 5000): Promise<string[]> {
  // The anonymous client, because both callers — `generateStaticParams` and
  // the sitemap — run at build time where there is no request to read cookies
  // from, and because a sitemap should list what a stranger can reach.
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from('public_ads')
    .select('slug')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []).map((row) => row.slug as string);
}

/**
 * Related advertisements.
 *
 * The same rule as `lib/classifieds/similar.ts`, but applied to a shortlist
 * the database picked rather than to everything: same category, same location
 * first, newest as the tie-break. Scoring a whole category in memory to choose
 * four cards would mean loading the category to render a sidebar.
 */
export async function getSimilarPublicAdvertisements(
  advertisement: Advertisement,
  limit = 4,
): Promise<Advertisement[]> {
  if (!advertisement.categorySlug) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('public_ads')
    .select(LIST_COLUMNS)
    .eq('category_slug', advertisement.categorySlug)
    .neq('id', advertisement.id)
    .order('published_at', { ascending: false })
    .limit(limit * 4);

  if (error || !data) return [];

  const candidates = (data as unknown as ListRow[]).map((row) => toAdvertisement(row));
  const { findSimilar } = await import('@/lib/classifieds/similar');
  return findSimilar(advertisement, candidates, limit);
}

/* ----------------------------------------------------- short lists -- */

/**
 * The homepage bands and the "similar" strip under an expired advertisement.
 * The same view as everything else here, so "active" is decided by Postgres
 * and never by a component.
 */
export async function getFeaturedPublicAdvertisements(limit: number): Promise<Advertisement[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('public_ads')
    .select(LIST_COLUMNS)
    .eq('is_featured', true)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as ListRow[]).map((row) => toAdvertisement(row));
}

export async function getLatestPublicAdvertisements(
  limit: number,
  categorySlug?: string,
): Promise<Advertisement[]> {
  const supabase = await createSupabaseServerClient();
  let request = supabase.from('public_ads').select(LIST_COLUMNS);
  if (categorySlug) request = request.eq('category_slug', categorySlug);
  const { data, error } = await request.order('published_at', { ascending: false }).limit(limit);
  if (error || !data) return [];
  return (data as unknown as ListRow[]).map((row) => toAdvertisement(row));
}

export interface ExpiredAdvertisementStub {
  slug: string;
  title: string;
  categorySlug: string | null;
  categoryName: string | null;
  locationSlug: string | null;
  endedAt: string;
}

/**
 * What the public may know about an advertisement whose run has ended: its
 * title, its section and when it ended. `expired_ad_stub()` returns nothing
 * for an advertisement that was refused or never published, so this cannot
 * be used to find out what is in the queue.
 */
export async function getExpiredPublicStub(slug: string): Promise<ExpiredAdvertisementStub | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('expired_ad_stub', { p_slug: slug });
  const row = !error && Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    slug: row.slug,
    title: row.title,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    locationSlug: row.location_slug,
    endedAt: row.ended_at,
  };
}

/**
 * How many live advertisements there are in each category-and-place pair.
 *
 * One grouped read rather than a query per pair: nine categories by nine
 * places is eighty-one combinations, and asking eighty-one times to decide
 * which landing pages are worth having would cost more than the pages save.
 *
 * Only `category_slug` and `location_slug` are selected — this is a counting
 * query and has no business pulling contact details across the wire.
 */
export const countPublicByCategoryAndLocation = cache(
  async (): Promise<Readonly<Record<string, number>>> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('public_ads')
      .select('category_slug, location_slug');

    if (error) return {};

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const category = row.category_slug as string | null;
      const location = row.location_slug as string | null;
      if (!category || !location) continue;
      const key = `${category}/${location}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  },
);

export interface SitemapEntry {
  slug: string;
  /** When the advertisement last changed, for `lastmod`. */
  updatedAt: string | null;
}

/**
 * One page of advertisements for the sitemap, newest first.
 *
 * Paged rather than "all of them" because a sitemap file may hold 50,000 URLs
 * and 50 MB, and because reading every row to build one document is the kind
 * of query that is fine at two hundred advertisements and an outage at two
 * hundred thousand. `sitemapAdvertisementCount` decides how many pages there
 * are; this returns one of them.
 *
 * `updated_at` comes along so each entry carries a real `lastmod`. A sitemap
 * that stamps every URL with today's date tells a crawler that everything
 * changed today, which is false, and which is why crawlers learn to ignore
 * `lastmod` from sites that do it.
 */
export async function getPublicAdvertisementPage(
  offset: number,
  limit: number,
): Promise<SitemapEntry[]> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from('public_ads')
    .select('slug, updated_at')
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return [];
  return (data ?? []).map((row) => ({
    slug: row.slug as string,
    updatedAt: (row.updated_at as string | null) ?? null,
  }));
}

/** How many advertisements the sitemap has to cover. */
export async function sitemapAdvertisementCount(): Promise<number> {
  const supabase = createSupabaseAnonClient();
  const { count, error } = await supabase
    .from('public_ads')
    .select('id', { count: 'exact', head: true });

  if (error) return 0;
  return count ?? 0;
}
