import 'server-only';

import { cache } from 'react';

import { requireStaff } from '@/lib/admin/guard';
import { ADMIN_PER_PAGE, type AdminAdQuery } from '@/lib/admin/query';
import { publicImageUrl } from '@/lib/storage';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AdStatus, ModerationAdRow } from '@/types/database';

/**
 * The review queue, and one advertisement in it.
 *
 * Everything here reads `moderation_ads`, which returns nothing at all unless
 * `is_staff()` is true inside the database. The `requireStaff()` call at the
 * top of each function is therefore not the protection — it is there so that a
 * page which somehow reached this code gets a clear error instead of a
 * mysteriously empty table.
 *
 * This module and `lib/data/public-ads.ts` never share a function. They read
 * different views on purpose: `moderation_ads` carries the advertiser's email
 * address and telephone number, and the surest way to leak those onto a public
 * page is a shared "get advertisement" helper that one caller forgot to
 * narrow.
 */

export interface QueueAdvertisement {
  id: string;
  reference: string;
  slug: string;
  kind: 'classified' | 'display';
  title: string;
  status: AdStatus;
  categoryName: string | null;
  locationName: string | null;
  advertiserName: string;
  advertiserEmail: string | null;
  createdAt: string;
  /** Who made the most recent status decision, and when — from the audit trail. */
  lastDecisionAt: string | null;
  lastDecisionBy: string | null;
  /** Approved, but past its expiry and not yet swept by the scheduled job. */
  isLapsed: boolean;
  pendingRenewalId: string | null;
  pendingRenewalTiming: 'early' | 'after_expiry' | null;
  pendingRenewalRequestedAt: string | null;
  pendingRenewalPackageId: string | null;
  renewalCount: number;
  publishedAt: string | null;
  expiresAt: string | null;
  rejectionReason: string | null;
  imageCount: number;
  artworkCount: number;
  openReportCount: number;
  hoursWaiting: number;
  viewCount: number;
  isFeatured: boolean;
}

const QUEUE_COLUMNS = `
  id, reference, slug, kind, title, status, category_name, location_name,
  advertiser_name, advertiser_email, created_at, published_at, expires_at,
  rejection_reason, image_count, artwork_count, open_report_count,
  hours_waiting, view_count, is_featured, last_decision_at, last_decision_by,
  is_lapsed, pending_renewal_id, pending_renewal_timing, pending_renewal_requested_at,
  pending_renewal_package_id, renewal_count, package_id
` as const;

function toQueueAdvertisement(row: ModerationAdRow): QueueAdvertisement {
  return {
    id: row.id,
    reference: row.reference,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    status: row.status,
    categoryName: row.category_name,
    locationName: row.location_name,
    advertiserName: row.advertiser_name,
    advertiserEmail: row.advertiser_email,
    createdAt: row.created_at,
    lastDecisionAt: row.last_decision_at,
    lastDecisionBy: row.last_decision_by,
    isLapsed: row.is_lapsed,
    pendingRenewalId: row.pending_renewal_id,
    pendingRenewalTiming: row.pending_renewal_timing,
    pendingRenewalRequestedAt: row.pending_renewal_requested_at,
    pendingRenewalPackageId: row.pending_renewal_package_id,
    renewalCount: row.renewal_count,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    rejectionReason: row.rejection_reason,
    imageCount: row.image_count,
    artworkCount: row.artwork_count,
    openReportCount: row.open_report_count,
    hoursWaiting: Number(row.hours_waiting ?? 0),
    viewCount: row.view_count,
    isFeatured: row.is_featured,
  };
}

export interface QueuePage {
  items: QueueAdvertisement[];
  total: number;
  page: number;
  pageCount: number;
  perPage: number;
}

/**
 * One page of the queue.
 *
 * The search covers what somebody in the office actually has in front of them
 * when they go looking: the reference from a telephone call, a word from the
 * title, the advertiser's name, their email address, or a telephone number —
 * either the one on the advertisement or the one on the account. Staff are
 * permitted to see both; the view they search is already staff-only. Each
 * term is escaped before it reaches PostgREST's `or` filter, which is a
 * comma-separated list of conditions — an unescaped comma or parenthesis in a
 * search box would otherwise be read as more filters.
 */
export async function queryQueue(query: AdminAdQuery): Promise<QueuePage> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  let request = supabase.from('moderation_ads').select(QUEUE_COLUMNS, { count: 'exact' });

  /*
   * "Approved" and "expired" by what a reader would see, not only by the
   * status column. An advertisement past its expiry that the scheduled sweep
   * has not reached yet still says `approved`, but `public_ads` already hides
   * it — so it belongs on the finished list, and must not sit on the live one
   * looking live.
   */
  if (query.status === 'approved') {
    request = request.eq('status', 'approved').eq('is_lapsed', false);
  } else if (query.status === 'expired') {
    request = request.or('status.eq.expired,is_lapsed.eq.true');
  } else if (query.status) {
    request = request.eq('status', query.status);
  }
  if (query.category) request = request.eq('category_slug', query.category);
  if (query.location) request = request.eq('location_slug', query.location);
  if (query.kind) request = request.eq('kind', query.kind);

  if (query.withinDays) {
    const cutoff = new Date(Date.now() - query.withinDays * 86_400_000);
    request = request.gte('created_at', cutoff.toISOString());
  }

  if (query.q) {
    const term = escapeForOrFilter(query.q);
    const conditions = [
      `reference.ilike.*${term}*`,
      `title.ilike.*${term}*`,
      `advertiser_name.ilike.*${term}*`,
      `advertiser_email.ilike.*${term}*`,
    ];
    // A telephone number is searched by its digits, however it was typed:
    // "98123 45680", "+91 9812345680" and "9812345680" are the same number.
    const digits = query.q.replace(/\D/g, '').slice(-10);
    if (digits.length >= 4) {
      conditions.push(`contact_phone.ilike.*${digits}*`, `advertiser_phone.ilike.*${digits}*`);
    }
    request = request.or(conditions.join(','));
  }

  const page = Math.max(1, query.page);
  const from = (page - 1) * ADMIN_PER_PAGE;

  const sorted =
    query.sort === 'newest'
      ? request.order('created_at', { ascending: false })
      : query.sort === 'reports'
        ? request
            .order('open_report_count', { ascending: false })
            .order('created_at', { ascending: true })
        : request.order('created_at', { ascending: true });

  const { data, count, error } = await sorted.range(from, from + ADMIN_PER_PAGE - 1);
  if (error) throw new Error(`Could not load the queue: ${error.message}`);

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PER_PAGE));

  return {
    items: ((data ?? []) as unknown as ModerationAdRow[]).map(toQueueAdvertisement),
    total,
    page: Math.min(page, pageCount),
    pageCount,
    perPage: ADMIN_PER_PAGE,
  };
}

/**
 * PostgREST reads `or=(a.eq.1,b.eq.2)` as a comma-separated list, so a comma,
 * a parenthesis or a quote typed into the search box would otherwise become
 * syntax. Doubling the quote and wrapping the value keeps it a value.
 */
function escapeForOrFilter(value: string): string {
  return value.replace(/["(),*\\]/g, ' ').trim();
}

/* --------------------------------------------------------- one advert -- */

export interface AdvertisementImage {
  id: string;
  url: string | null;
  storagePath: string;
  sortOrder: number;
  width: number | null;
  height: number | null;
}

export interface AdvertisementArtwork {
  id: string;
  fileName: string;
  storagePath: string;
  contentType: string;
  byteSize: number;
  sortOrder: number;
  /** A time-limited link, minted per request. The bucket itself is private. */
  signedUrl: string | null;
}

export interface ReviewAdvertisement extends QueueAdvertisement {
  description: string;
  price: number | null;
  priceType: ModerationAdRow['price_type'];
  attributes: Record<string, unknown>;
  categorySlug: string | null;
  locationSlug: string | null;
  contactName: string;
  contactPhone: string;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  showPhone: boolean;
  showWhatsapp: boolean;
  packageId: string | null;
  packagePricePaise: number | null;
  updatedAt: string;
  advertiserId: string;
  advertiserPhone: string | null;
  advertiserSince: string;
  advertiserBlocked: boolean;
  images: AdvertisementImage[];
  artwork: AdvertisementArtwork[];
  display: { organisationName: string; website: string | null; notes: string | null } | null;
}

export const getAdvertisementForReview = cache(
  async (id: string): Promise<ReviewAdvertisement | null> => {
    await requireStaff();
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from('moderation_ads')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as unknown as ModerationAdRow;

    const [images, artwork, display] = await Promise.all([
      loadImages(id),
      loadArtwork(id),
      row.kind === 'display' ? loadDisplayDetails(id) : Promise.resolve(null),
    ]);

    return {
      ...toQueueAdvertisement(row),
      description: row.description,
      price: row.price,
      priceType: row.price_type,
      attributes: row.attributes,
      categorySlug: row.category_slug,
      locationSlug: row.location_slug,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      contactWhatsapp: row.contact_whatsapp,
      contactEmail: row.contact_email,
      showPhone: row.show_phone,
      showWhatsapp: row.show_whatsapp,
      packageId: row.package_id,
      packagePricePaise: row.package_price_paise,
      updatedAt: row.updated_at,
      advertiserId: row.user_id,
      advertiserPhone: row.advertiser_phone,
      advertiserSince: row.advertiser_since,
      advertiserBlocked: row.advertiser_blocked,
      images,
      artwork,
      display,
    };
  },
);

async function loadImages(adId: string): Promise<AdvertisementImage[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('ad_images')
    .select('id, storage_path, sort_order, width, height')
    .eq('ad_id', adId)
    .order('sort_order', { ascending: true });

  return (data ?? []).map((image) => ({
    id: image.id,
    url: publicImageUrl(image.storage_path),
    storagePath: image.storage_path,
    sortOrder: image.sort_order,
    width: image.width,
    height: image.height,
  }));
}

/**
 * Artwork links are signed, and short-lived.
 *
 * `ad-artwork` is a private bucket — a display advertiser's design before the
 * campaign runs is commercially sensitive. A signed URL lets a moderator open
 * the file without the bucket being public and without the page ever holding a
 * credential: the signature is made server-side, is good for a few minutes,
 * and grants exactly one object.
 */
async function loadArtwork(adId: string): Promise<AdvertisementArtwork[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('ad_artwork')
    .select('id, file_name, storage_path, content_type, byte_size, sort_order')
    .eq('ad_id', adId)
    .order('sort_order', { ascending: true });

  const rows = data ?? [];
  if (!rows.length) return [];

  const { data: signed } = await supabase.storage
    .from('ad-artwork')
    .createSignedUrls(
      rows.map((row) => row.storage_path),
      300,
    );

  const urlByPath = new Map<string, string>();
  for (const entry of signed ?? []) {
    if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
  }

  return rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    contentType: row.content_type,
    byteSize: row.byte_size,
    sortOrder: row.sort_order,
    signedUrl: urlByPath.get(row.storage_path) ?? null,
  }));
}

async function loadDisplayDetails(adId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('display_ad_details')
    .select('organisation_name, website, notes')
    .eq('ad_id', adId)
    .maybeSingle();

  if (!data) return null;
  return {
    organisationName: data.organisation_name,
    website: data.website,
    notes: data.notes,
  };
}

/** This advertisement's own history, for the review page. */
export async function getAdvertisementHistory(adId: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('admin_actions')
    .select('id, occurred_at, action, summary, actor_name, previous_status, new_status, note, event')
    .eq('entity', 'advertisement')
    .eq('entity_id', adId)
    .order('occurred_at', { ascending: false })
    .limit(50);

  return data ?? [];
}
