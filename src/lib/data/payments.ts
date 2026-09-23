import 'server-only';

import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  AdminPaymentRow,
  MyPaymentRow,
  PaymentPurpose,
  PaymentStatus,
} from '@/types/database';

/**
 * Reading payments.
 *
 * Both sides read a view, and the view is where the rule lives: `my_payments`
 * filters on `auth.uid()`, `admin_payments` returns nothing unless the caller
 * is staff. Neither function below contains an ownership check, because
 * neither should — a check written here is a check that the next page can
 * forget to write.
 */

export interface PaymentFilters {
  status?: PaymentStatus | null;
  purpose?: PaymentPurpose | null;
  packageId?: string | null;
  /** ISO dates, inclusive. */
  from?: string | null;
  to?: string | null;
  query?: string | null;
}

export const OWNER_PAYMENTS_PAGE_SIZE = 25;

export interface MyPaymentPage {
  rows: MyPaymentRow[];
  /** Every payment the caller has, not merely those on this page. */
  total: number;
}

/**
 * One page of an advertiser's own payments, newest first.
 *
 * `my_payments` filters on the caller inside the database, so there is no user
 * id in this function and nothing to pass one to. Paging changes how many rows
 * come back and nothing about whose they are.
 *
 * Ranged with `.range()`, the same as `getAdminPayments` directly below and
 * the public browse. Before Phase 13 this read every payment an advertiser had
 * ever made; bounded by their own activity, but unbounded in the sense that
 * nothing stopped it growing for ever.
 */
export async function getUserPayments(
  page = { index: 0, size: OWNER_PAYMENTS_PAGE_SIZE },
): Promise<MyPaymentPage> {
  if (!isSupabaseConfigured) return { rows: [], total: 0 };

  const supabase = await createSupabaseServerClient();
  const from = page.index * page.size;
  const { data, error, count } = await supabase
    .from('my_payments')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + page.size - 1);

  if (error || !data) return { rows: [], total: 0 };
  return { rows: data, total: count ?? data.length };
}

/** One of the advertiser's own payments, or null — including when it is not theirs. */
export async function getUserPayment(id: string): Promise<MyPaymentRow | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('my_payments').select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

export interface AdminPaymentPage {
  rows: AdminPaymentRow[];
  total: number;
  /** Totals for what the filters currently select, in paise. */
  collectedPaise: number;
}

/** The office's ledger, filtered. Returns nothing at all to a non-staff caller. */
export async function getAdminPayments(
  filters: PaymentFilters = {},
  page = { index: 0, size: 50 },
): Promise<AdminPaymentPage> {
  if (!isSupabaseConfigured) return { rows: [], total: 0, collectedPaise: 0 };

  const supabase = await createSupabaseServerClient();
  let query = supabase.from('admin_payments').select('*', { count: 'exact' });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.purpose) query = query.eq('purpose', filters.purpose);
  if (filters.packageId) query = query.eq('package_id', filters.packageId);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);

  const search = filters.query?.trim();
  if (search) {
    // Reference, title and the provider's payment id are the three things
    // somebody at the counter has in front of them.
    const escaped = search.replace(/[,()]/g, ' ');
    query = query.or(
      `ad_reference.ilike.%${escaped}%,ad_title.ilike.%${escaped}%,provider_payment_id.ilike.%${escaped}%`,
    );
  }

  const from = page.index * page.size;
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + page.size - 1);

  if (error || !data) return { rows: [], total: 0, collectedPaise: 0 };

  return {
    rows: data,
    total: count ?? data.length,
    collectedPaise: data
      .filter((row) => row.status === 'paid')
      .reduce((sum, row) => sum + row.amount_paise, 0),
  };
}

/** Every payment raised against one advertisement, for its admin page. */
export async function getPaymentsForAd(adId: string): Promise<AdminPaymentRow[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('admin_payments')
    .select('*')
    .eq('ad_id', adId)
    .order('created_at', { ascending: false });

  return data ?? [];
}

/**
 * What the advertiser owes on one advertisement, if anything.
 *
 * Used by the dashboard to say "Payment: paid" beside "Advertisement: pending
 * review", which is the distinction Phase 9 is most insistent about: paid and
 * approved are different questions with different answers.
 */
export async function getLatestPaymentForAd(
  adId: string,
  purpose: PaymentPurpose = 'new_advertisement',
): Promise<MyPaymentRow | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('my_payments')
    .select('*')
    .eq('ad_id', adId)
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}
