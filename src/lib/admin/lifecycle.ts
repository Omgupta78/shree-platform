import 'server-only';

import { requireStaff } from '@/lib/admin/guard';
import { ADMIN_PER_PAGE, type RawSearchParams } from '@/lib/admin/query';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AdRenewalRow, ModerationAdRow } from '@/types/database';

/**
 * The office's view of the lifecycle: what is about to end, and what is
 * waiting to be renewed. Everything reads `moderation_ads` / `ad_renewals`,
 * which return nothing to anybody who is not staff; `requireStaff()` is here
 * for a clear error, not for protection.
 */

export const EXPIRY_RANGES = [
  { value: 3, label: 'Next 3 days' },
  { value: 7, label: 'Next 7 days' },
  { value: 14, label: 'Next 14 days' },
  { value: 30, label: 'Next 30 days' },
] as const;

export interface ExpiringQuery {
  category: string | null;
  kind: 'classified' | 'display' | null;
  withinDays: number;
  sort: 'soonest' | 'latest';
  page: number;
}

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function parseExpiringQuery(params: RawSearchParams, defaultDays: number): ExpiringQuery {
  const range = Number.parseInt(first(params.range) ?? '', 10);
  const kind = first(params.kind);
  const page = Number.parseInt(first(params.page) ?? '1', 10);
  return {
    category: first(params.category),
    kind: kind === 'classified' || kind === 'display' ? kind : null,
    withinDays: EXPIRY_RANGES.some((item) => item.value === range) ? range : defaultDays,
    sort: first(params.sort) === 'latest' ? 'latest' : 'soonest',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export interface ExpiringAdvertisement {
  id: string;
  reference: string;
  title: string;
  kind: 'classified' | 'display';
  status: ModerationAdRow['status'];
  advertiserName: string;
  categoryName: string | null;
  publishedAt: string | null;
  expiresAt: string;
  pendingRenewalId: string | null;
}

/** Live advertisements whose run ends within the chosen window. */
export async function getExpiringAdvertisements(query: ExpiringQuery) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  const now = new Date();
  const until = new Date(now.getTime() + query.withinDays * 86_400_000);

  let request = supabase
    .from('moderation_ads')
    .select(
      'id, reference, title, kind, status, advertiser_name, category_name, published_at, expires_at, pending_renewal_id',
      { count: 'exact' },
    )
    .eq('status', 'approved')
    .gt('expires_at', now.toISOString())
    .lte('expires_at', until.toISOString());

  if (query.category) request = request.eq('category_slug', query.category);
  if (query.kind) request = request.eq('kind', query.kind);

  const from = (query.page - 1) * ADMIN_PER_PAGE;
  const { data, count, error } = await request
    .order('expires_at', { ascending: query.sort === 'soonest' })
    .range(from, from + ADMIN_PER_PAGE - 1);
  if (error) throw new Error('Could not load the expiring advertisements.');

  const rows = (data ?? []) as unknown as ModerationAdRow[];
  const total = count ?? 0;
  return {
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / ADMIN_PER_PAGE)),
    items: rows.map<ExpiringAdvertisement>((row) => ({
      id: row.id,
      reference: row.reference,
      title: row.title,
      kind: row.kind,
      status: row.status,
      advertiserName: row.advertiser_name,
      categoryName: row.category_name,
      publishedAt: row.published_at,
      expiresAt: row.expires_at as string,
      pendingRenewalId: row.pending_renewal_id,
    })),
  };
}

export interface PendingRenewal {
  renewalId: string;
  advertisementId: string;
  reference: string;
  title: string;
  advertiserName: string;
  status: ModerationAdRow['status'];
  timing: 'early' | 'after_expiry';
  packageId: string;
  requestedAt: string;
  expiresAt: string | null;
}

/** Every renewal waiting for a decision, oldest request first. */
export async function getPendingRenewals(): Promise<PendingRenewal[]> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('moderation_ads')
    .select(
      'id, reference, title, advertiser_name, status, expires_at, pending_renewal_id, pending_renewal_timing, pending_renewal_package_id, pending_renewal_requested_at',
    )
    .not('pending_renewal_id', 'is', null)
    .order('pending_renewal_requested_at', { ascending: true })
    .limit(200);
  if (error) throw new Error('Could not load the renewals.');

  return ((data ?? []) as unknown as ModerationAdRow[]).map((row) => ({
    renewalId: row.pending_renewal_id as string,
    advertisementId: row.id,
    reference: row.reference,
    title: row.title,
    advertiserName: row.advertiser_name,
    status: row.status,
    timing: row.pending_renewal_timing ?? 'after_expiry',
    packageId: row.pending_renewal_package_id ?? '',
    requestedAt: row.pending_renewal_requested_at ?? '',
    expiresAt: row.expires_at,
  }));
}

/** One advertisement's renewals, newest first, for the review page. */
export async function getAdvertisementRenewals(adId: string): Promise<AdRenewalRow[]> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('ad_renewals')
    .select('*')
    .eq('ad_id', adId)
    .order('renewal_number', { ascending: false });
  return (data ?? []) as AdRenewalRow[];
}
