import 'server-only';

import { cache } from 'react';

import { publicImageUrl } from '@/lib/storage';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AdStatus, OwnerAdRow } from '@/types/database';

/**
 * An advertiser's own advertisements.
 *
 * Read from `owner_ads`, which filters on `user_id = auth.uid()` inside the
 * database. There is no user id in this file and nothing to pass one to: a bug
 * here cannot fetch somebody else's advertisements, because the query has no
 * way to name them.
 */

export interface MyAdvertisement {
  id: string;
  reference: string;
  slug: string;
  kind: 'classified' | 'display';
  title: string;
  status: AdStatus;
  rejectionReason: string | null;
  isFeatured: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  viewCount: number;
  categorySlug: string | null;
  locationSlug: string | null;
  coverImageUrl: string | null;
  packageId: string | null;
  categoryName: string | null;
  /** A renewal request is waiting for the office. */
  hasPendingRenewal: boolean;
}

const COLUMNS = `
  id, reference, slug, kind, title, status, rejection_reason, is_featured,
  published_at, expires_at, created_at, view_count, category_slug, location_slug,
  package_id, category_name
` as const;

type Row = Pick<
  OwnerAdRow,
  | 'id'
  | 'reference'
  | 'slug'
  | 'kind'
  | 'title'
  | 'status'
  | 'rejection_reason'
  | 'is_featured'
  | 'published_at'
  | 'expires_at'
  | 'created_at'
  | 'view_count'
  | 'category_slug'
  | 'location_slug'
  | 'package_id'
  | 'category_name'
>;

/**
 * One page of an advertiser's own advertisements.
 *
 * Paged with `.range()`, the same way `getAdminPayments` and the public browse
 * are. Before Phase 13 this read every row an advertiser had ever posted, and
 * then asked for the cover image and the pending renewal of every one of them
 * in two `IN (...)` lists built from that set. Bounded by one person's own
 * activity, so never a denial-of-service surface — but a business advertising
 * weekly for three years would have been fetching hundreds of rows and two
 * hundred-element IN lists to render twenty cards.
 *
 * The counts above the list are NOT derived from this. They come from
 * `getMyAdvertisementStates()`, so paging the list cannot quietly turn "you
 * have 60 advertisements" into "you have 20".
 */
export const OWNER_PAGE_SIZE = 20;

export interface MyAdvertisementPage {
  rows: MyAdvertisement[];
  /** Every advertisement the caller has, not merely those on this page. */
  total: number;
}

export const getMyAdvertisements = cache(
  async (page = { index: 0, size: OWNER_PAGE_SIZE }): Promise<MyAdvertisementPage> => {
    const supabase = await createSupabaseServerClient();
    const from = page.index * page.size;

    const { data, error, count } = await supabase
      .from('owner_ads')
      .select(COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + page.size - 1);

    if (error || !data) return { rows: [], total: 0 };

    const rows = await hydrate(data as unknown as Row[]);
    return { rows, total: count ?? rows.length };
  },
);

/**
 * Just enough of every advertisement to count them and to work out which have
 * expired: three small columns, no joins and no `IN (...)` lists.
 *
 * This is what keeps the dashboard's six figures exact while the list beside
 * them is paged. `expiryState()` needs only a status and an expiry date, so
 * there is nothing else to fetch — and fetching nothing else is the point.
 */
export interface MyAdvertisementState {
  id: string;
  status: AdStatus;
  expiresAt: string | null;
}

export const getMyAdvertisementStates = cache(
  async (): Promise<MyAdvertisementState[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('owner_ads')
      .select('id, status, expires_at')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return (data as unknown as Array<Pick<OwnerAdRow, 'id' | 'status' | 'expires_at'>>).map(
      (row) => ({ id: row.id, status: row.status, expiresAt: row.expires_at }),
    );
  },
);

/**
 * Full rows for a known, already-narrowed set of identifiers.
 *
 * Used where a page has decided WHICH advertisements it needs from the light
 * states above — the expiring-soon band, the expired list — and now needs
 * enough to draw them. The caller is expected to have bounded the set; the
 * database bounds it again to the caller's own advertisements regardless,
 * because `owner_ads` filters on `auth.uid()` inside the view.
 */
export async function getMyAdvertisementsByIds(
  ids: readonly string[],
): Promise<MyAdvertisement[]> {
  if (ids.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('owner_ads')
    .select(COLUMNS)
    .in('id', ids as string[])
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return hydrate(data as unknown as Row[]);
}

/**
 * Turns owner rows into what the interface renders.
 *
 * Cover images and waiting renewals in one query each, not one per row — and
 * now only ever for the rows actually being shown, which is what makes the
 * `IN (...)` lists small.
 *
 * `ad_renewals` is filtered to the caller by its own policy.
 */
async function hydrate(rows: Row[]): Promise<MyAdvertisement[]> {
  if (!rows.length) return [];

  const supabase = await createSupabaseServerClient();
  const ids = rows.map((row) => row.id);

  const [{ data: images }, { data: renewals }] = await Promise.all([
    supabase
      .from('ad_images')
      .select('ad_id, storage_path, sort_order')
      .in('ad_id', ids)
      .order('sort_order', { ascending: true }),
    supabase.from('ad_renewals').select('ad_id').eq('status', 'pending').in('ad_id', ids),
  ]);
  const renewing = new Set((renewals ?? []).map((renewal) => renewal.ad_id));

  const coverByAd = new Map<string, string>();
  for (const image of images ?? []) {
    if (!coverByAd.has(image.ad_id)) coverByAd.set(image.ad_id, image.storage_path);
  }

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    status: row.status,
    rejectionReason: row.rejection_reason,
    isFeatured: row.is_featured,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    viewCount: row.view_count,
    categorySlug: row.category_slug,
    locationSlug: row.location_slug,
    coverImageUrl: publicImageUrl(coverByAd.get(row.id)),
    packageId: row.package_id,
    categoryName: row.category_name,
    hasPendingRenewal: renewing.has(row.id),
  }));
}

/**
 * What each state means, in the advertiser's terms.
 *
 * "Pending" is a database word. Somebody who has just sent an advertisement
 * wants to know whether anything is expected of them, and the answer is no.
 */
export const STATUS_COPY: Record<
  AdStatus,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger'; note: string }
> = {
  draft: {
    label: 'Draft',
    tone: 'neutral',
    note: 'Not sent to us yet.',
  },
  pending: {
    label: 'With our office',
    tone: 'warning',
    note: 'We are reading it. Nothing is needed from you.',
  },
  approved: {
    label: 'Live',
    tone: 'success',
    note: 'Published and visible to readers.',
  },
  rejected: {
    label: 'Not published',
    tone: 'danger',
    note: 'We could not publish it as written.',
  },
  changes_requested: {
    label: 'Needs a change',
    tone: 'warning',
    note: 'Our office has asked for one thing to be corrected before it can run.',
  },
  expired: {
    label: 'Expired',
    tone: 'neutral',
    note: 'Its run has ended. You can renew it; our office reviews it again before it goes back up.',
  },
  sold: {
    label: 'Marked sold',
    tone: 'neutral',
    note: 'You told us this one is done.',
  },
};

/* ------------------------------------------------------------- editing -- */

export interface MyAdvertisementImage {
  id: string;
  url: string | null;
  sortOrder: number;
}

/**
 * One of your own advertisements, with everything the edit form needs.
 *
 * Read from `owner_ads`, which filters on `user_id = auth.uid()` inside the
 * database. The id comes from the URL, and the answer to "is it yours" comes
 * from the view — not from a check in this file that somebody could later
 * forget to write.
 */
export interface MyAdvertisementDetail {
  id: string;
  reference: string;
  kind: 'classified' | 'display';
  status: AdStatus;
  title: string;
  description: string;
  price: number | null;
  priceType: OwnerAdRow['price_type'];
  categorySlug: string | null;
  locationSlug: string | null;
  attributes: Record<string, unknown>;
  contactName: string;
  contactPhone: string;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  showPhone: boolean;
  showWhatsapp: boolean;
  packageId: string | null;
  rejectionReason: string | null;
  artworkCount: number;
  images: MyAdvertisementImage[];
  display: { organisationName: string; website: string | null; notes: string | null } | null;
}

export const getMyAdvertisement = cache(
  async (id: string): Promise<MyAdvertisementDetail | null> => {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from('owner_ads')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as unknown as OwnerAdRow;

    const [{ data: images }, { count: artworkCount }, display] = await Promise.all([
      supabase
        .from('ad_images')
        .select('id, storage_path, sort_order')
        .eq('ad_id', id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('ad_artwork')
        .select('id', { count: 'exact', head: true })
        .eq('ad_id', id),
      row.kind === 'display'
        ? supabase
            .from('display_ad_details')
            .select('organisation_name, website, notes')
            .eq('ad_id', id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      id: row.id,
      reference: row.reference,
      kind: row.kind,
      status: row.status,
      title: row.title,
      description: row.description,
      price: row.price,
      priceType: row.price_type,
      categorySlug: row.category_slug,
      locationSlug: row.location_slug,
      attributes: row.attributes,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      contactWhatsapp: row.contact_whatsapp,
      contactEmail: row.contact_email,
      showPhone: row.show_phone,
      showWhatsapp: row.show_whatsapp,
      packageId: row.package_id,
      rejectionReason: row.rejection_reason,
      artworkCount: artworkCount ?? 0,
      images: (images ?? []).map((image) => ({
        id: image.id,
        url: publicImageUrl(image.storage_path),
        sortOrder: image.sort_order,
      })),
      display: display.data
        ? {
            organisationName: display.data.organisation_name,
            website: display.data.website,
            notes: display.data.notes,
          }
        : null,
    };
  },
);

/* ----------------------------------------------------------- lifecycle -- */

export interface MyRenewal {
  id: string;
  renewalNumber: number;
  packageId: string;
  timing: 'early' | 'after_expiry';
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  requestedAt: string;
  previousPublishedAt: string | null;
  previousExpiresAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  newPublishedAt: string | null;
  newExpiresAt: string | null;
}

export interface MyAdvertisementLifecycle {
  id: string;
  reference: string;
  slug: string;
  kind: 'classified' | 'display';
  title: string;
  description: string;
  status: AdStatus;
  rejectionReason: string | null;
  categoryName: string | null;
  locationName: string | null;
  packageId: string | null;
  createdAt: string;
  publishedAt: string | null;
  expiresAt: string | null;
  coverImageUrl: string | null;
  renewals: MyRenewal[];
}

/**
 * One of your advertisements with its run and its renewal history.
 * Null when the id is not yours — `owner_ads` and the `ad_renewals` policy
 * both answer that inside the database.
 */
export const getMyAdvertisementLifecycle = cache(
  async (id: string): Promise<MyAdvertisementLifecycle | null> => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from('owner_ads')
      .select(
        'id, reference, slug, kind, title, description, status, rejection_reason, category_name, location_name, package_id, created_at, published_at, expires_at',
      )
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as OwnerAdRow;

    const [{ data: renewals }, { data: cover }] = await Promise.all([
      supabase
        .from('ad_renewals')
        .select(
          'id, renewal_number, package_id, timing, status, requested_at, previous_published_at, previous_expires_at, decided_at, decision_note, new_published_at, new_expires_at',
        )
        .eq('ad_id', id)
        .order('renewal_number', { ascending: false }),
      supabase
        .from('ad_images')
        .select('storage_path')
        .eq('ad_id', id)
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      id: row.id,
      reference: row.reference,
      slug: row.slug,
      kind: row.kind,
      title: row.title,
      description: row.description,
      status: row.status,
      rejectionReason: row.rejection_reason,
      categoryName: row.category_name,
      locationName: row.location_name,
      packageId: row.package_id,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      expiresAt: row.expires_at,
      coverImageUrl: publicImageUrl(cover?.storage_path),
      renewals: (renewals ?? []).map((renewal) => ({
        id: renewal.id,
        renewalNumber: renewal.renewal_number,
        packageId: renewal.package_id,
        timing: renewal.timing,
        status: renewal.status,
        requestedAt: renewal.requested_at,
        previousPublishedAt: renewal.previous_published_at,
        previousExpiresAt: renewal.previous_expires_at,
        decidedAt: renewal.decided_at,
        decisionNote: renewal.decision_note,
        newPublishedAt: renewal.new_published_at,
        newExpiresAt: renewal.new_expires_at,
      })),
    };
  },
);

/**
 * The owner's view of an advertisement they are looking at on the public
 * site. Null for anybody else — including a signed-out visitor, for whom
 * `owner_ads` is empty.
 */
export async function getOwnedAdvertisementBySlug(slug: string): Promise<{
  id: string;
  status: AdStatus;
  publishedAt: string | null;
  expiresAt: string | null;
  hasPendingRenewal: boolean;
} | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('owner_ads')
    .select('id, status, published_at, expires_at')
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return null;
  const { count } = await supabase
    .from('ad_renewals')
    .select('id', { count: 'exact', head: true })
    .eq('ad_id', data.id)
    .eq('status', 'pending');
  return {
    id: data.id,
    status: data.status,
    publishedAt: data.published_at,
    expiresAt: data.expires_at,
    hasPendingRenewal: (count ?? 0) > 0,
  };
}
