import 'server-only';

import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DateRange } from '@/lib/analytics/range';

/**
 * Reading the figures.
 *
 * Each of these is one call to one SQL function that has already done the
 * counting. Nothing in this file adds up rows, and nothing fetches a list in
 * order to measure its length — a dashboard that does that works until the
 * year it does not.
 *
 * Authorisation is not here either. Every function refuses a caller who is
 * neither staff nor a trusted connection, in the database, so a page that
 * forgot its guard still gets nothing.
 *
 * Every function returns NULL rather than throwing, and null means one
 * specific thing: the figure could not be read. A period in which nothing
 * happened is not null — it is a row of real zeros.
 *
 * The distinction is the whole point. A moderator is refused revenue in the
 * database, and a refusal that came back as `revenue_paise: 0` would put ₹0 on
 * the dashboard as though it had been measured. One failed query costs its own
 * panel, which then says it has no data; it never costs the page, and it never
 * becomes a figure.
 */

export interface Overview {
  adsCreated: number;
  adsLive: number;
  adsPending: number;
  adsExpired: number;
  usersTotal: number;
  usersNew: number;
  revenuePaise: number;
  paymentsPaid: number;
  paymentsAttempted: number;
  averageValuePaise: number | null;
  refundedPaise: number;
  decisionsMade: number;
  decisionsApproved: number;
  renewalsRequested: number;
  renewalsApproved: number;
  adsBecameEligible: number;
}

type Args = { p_from: string; p_to: string };

function bounds(range: DateRange): Args {
  return { p_from: range.from.toISOString(), p_to: range.to.toISOString() };
}

/**
 * Calling a function by name.
 *
 * The eleven analytics functions are addressed by name rather than declared
 * one by one in `types/database.ts`: each returns a different shape, and
 * eleven more entries there would be eleven more places to keep in step with
 * the migration. The shape is asserted once, here, on the interfaces below —
 * and `analytics_checks.sql` is what actually holds the two together.
 */
type RpcResult = { data: unknown; error: { message: string } | null };

async function callRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (!isSupabaseConfigured) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase.rpc(
      name as never,
      args as never,
    )) as unknown as RpcResult;

    if (error) {
      // One failed panel, not one failed page.
      console.error(`analytics: ${name} failed`, error.message);
      return null;
    }
    return data ?? null;
  } catch (error) {
    console.error(
      `analytics: ${name} threw`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * One row, or null.
 *
 * Null covers both "the call failed or was refused" and "the function
 * genuinely returned no row". Neither is a measurement, and a panel treats
 * both the same way: it says so.
 */
async function callOne<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  const data = await callRpc(name, args);
  if (data === null) return null;
  // A `returns table` function of one row arrives as an array of one.
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return (data as T) ?? null;
}

/** Rows, or null when the call itself failed. An empty array is a real answer. */
async function callMany<T>(name: string, args: Record<string, unknown>): Promise<T[] | null> {
  const data = await callRpc(name, args);
  return Array.isArray(data) ? (data as T[]) : null;
}

/* --------------------------------------------------------------- shapes -- */

interface OverviewRow {
  ads_created: number;
  ads_live: number;
  ads_pending: number;
  ads_expired: number;
  users_total: number;
  users_new: number;
  revenue_paise: number;
  payments_paid: number;
  payments_attempted: number;
  average_value_paise: number | null;
  refunded_paise: number;
  decisions_made: number;
  decisions_approved: number;
  renewals_requested: number;
  renewals_approved: number;
  ads_became_eligible: number;
}

/*
 * Wrapped in React's `cache` because three panels read the overview and two
 * read the series. The dashboard's panels are separate async components on
 * purpose — one slow query should not hold up the rest of the page — and
 * without this each of them would ask the database the same question.
 *
 * The key is the argument's identity, so a page must resolve its range once
 * and hand the SAME object to every panel. The dashboard does.
 */
export const getDashboardMetrics = cache(_getDashboardMetrics);

async function _getDashboardMetrics(range: DateRange): Promise<Overview | null> {
  const row = await callOne<OverviewRow>('analytics_overview', bounds(range));
  if (!row) return null;

  return {
    adsCreated: Number(row.ads_created ?? 0),
    adsLive: Number(row.ads_live ?? 0),
    adsPending: Number(row.ads_pending ?? 0),
    adsExpired: Number(row.ads_expired ?? 0),
    usersTotal: Number(row.users_total ?? 0),
    usersNew: Number(row.users_new ?? 0),
    revenuePaise: Number(row.revenue_paise ?? 0),
    paymentsPaid: Number(row.payments_paid ?? 0),
    paymentsAttempted: Number(row.payments_attempted ?? 0),
    averageValuePaise: row.average_value_paise === null ? null : Number(row.average_value_paise),
    refundedPaise: Number(row.refunded_paise ?? 0),
    decisionsMade: Number(row.decisions_made ?? 0),
    decisionsApproved: Number(row.decisions_approved ?? 0),
    renewalsRequested: Number(row.renewals_requested ?? 0),
    renewalsApproved: Number(row.renewals_approved ?? 0),
    adsBecameEligible: Number(row.ads_became_eligible ?? 0),
  };
}

export interface TimeseriesPoint {
  bucket: string;
  adsCreated: number;
  adsPublished: number;
  paymentsPaid: number;
  revenuePaise: number;
  usersNew: number;
}

export const getTimeseries = cache(_getTimeseries);

async function _getTimeseries(range: DateRange): Promise<TimeseriesPoint[] | null> {
  const rows = await callMany<Record<string, unknown>>('analytics_timeseries', {
    ...bounds(range),
    p_grain: range.grain,
  });
  if (rows === null) return null;
  return rows.map((r) => ({
    bucket: String(r.bucket),
    adsCreated: Number(r.ads_created ?? 0),
    adsPublished: Number(r.ads_published ?? 0),
    paymentsPaid: Number(r.payments_paid ?? 0),
    revenuePaise: Number(r.revenue_paise ?? 0),
    usersNew: Number(r.users_new ?? 0),
  }));
}

export interface PackageRow {
  packageId: string;
  packageName: string;
  purchases: number;
  revenuePaise: number;
  averagePaise: number;
}

export async function getRevenueByPackage(range: DateRange): Promise<PackageRow[] | null> {
  const rows = await callMany<Record<string, unknown>>('analytics_by_package', bounds(range));
  if (rows === null) return null;
  return rows.map((r) => ({
    packageId: String(r.package_id),
    packageName: String(r.package_name),
    purchases: Number(r.purchases ?? 0),
    revenuePaise: Number(r.revenue_paise ?? 0),
    averagePaise: Number(r.average_paise ?? 0),
  }));
}

export interface CategoryRow {
  categoryId: string;
  categoryName: string;
  adsCreated: number;
  adsLive: number;
  revenuePaise: number;
}

export async function getCategoryAnalytics(range: DateRange): Promise<CategoryRow[] | null> {
  const rows = await callMany<Record<string, unknown>>('analytics_by_category', bounds(range));
  if (rows === null) return null;
  return rows.map((r) => ({
    categoryId: String(r.category_id),
    categoryName: String(r.category_name),
    adsCreated: Number(r.ads_created ?? 0),
    adsLive: Number(r.ads_live ?? 0),
    revenuePaise: Number(r.revenue_paise ?? 0),
  }));
}

export interface LocationRow {
  locationId: string;
  locationName: string;
  locationKind: string;
  adsCreated: number;
  adsLive: number;
}

export async function getLocationAnalytics(range: DateRange): Promise<LocationRow[] | null> {
  const rows = await callMany<Record<string, unknown>>('analytics_by_location', bounds(range));
  if (rows === null) return null;
  return rows.map((r) => ({
    locationId: String(r.location_id),
    locationName: String(r.location_name),
    locationKind: String(r.location_kind),
    adsCreated: Number(r.ads_created ?? 0),
    adsLive: Number(r.ads_live ?? 0),
  }));
}

export interface ModerationSummary {
  decidedTotal: number;
  approved: number;
  rejected: number;
  changesRequested: number;
  awaitingReview: number;
  medianHours: number | null;
  averageHours: number | null;
}

export async function getModerationAnalytics(
  range: DateRange,
): Promise<ModerationSummary | null> {
  const row = await callOne<Record<string, unknown>>('analytics_moderation', bounds(range));
  if (!row) return null;
  return {
    decidedTotal: Number(row.decided_total ?? 0),
    approved: Number(row.approved ?? 0),
    rejected: Number(row.rejected ?? 0),
    changesRequested: Number(row.changes_requested ?? 0),
    awaitingReview: Number(row.awaiting_review ?? 0),
    medianHours: row.median_hours === null || row.median_hours === undefined ? null : Number(row.median_hours),
    averageHours: row.average_hours === null || row.average_hours === undefined ? null : Number(row.average_hours),
  };
}

export interface ModeratorRow {
  moderatorId: string;
  moderatorName: string;
  decisions: number;
  approved: number;
  rejected: number;
}

export async function getModerators(range: DateRange): Promise<ModeratorRow[] | null> {
  const rows = await callMany<Record<string, unknown>>('analytics_moderators', bounds(range));
  if (rows === null) return null;
  return rows.map((r) => ({
    moderatorId: String(r.moderator_id),
    moderatorName: String(r.moderator_name),
    decisions: Number(r.decisions ?? 0),
    approved: Number(r.approved ?? 0),
    rejected: Number(r.rejected ?? 0),
  }));
}

export interface RenewalSummary {
  requested: number;
  approved: number;
  rejected: number;
  stillPending: number;
  renewedEarly: number;
  renewedLate: number;
  paidRenewals: number;
  expiringSoon: number;
}

export async function getRenewalAnalytics(range: DateRange): Promise<RenewalSummary | null> {
  const row = await callOne<Record<string, unknown>>('analytics_renewals', bounds(range));
  if (!row) return null;
  const n = (key: string) => Number(row[key] ?? 0);
  return {
    requested: n('requested'),
    approved: n('approved'),
    rejected: n('rejected'),
    stillPending: n('still_pending'),
    renewedEarly: n('renewed_early'),
    renewedLate: n('renewed_late'),
    paidRenewals: n('paid_renewals'),
    expiringSoon: n('expiring_soon'),
  };
}

export interface SearchRow {
  term: string;
  searches: number;
  zeroResult: number;
  lastSeen: string;
}

export async function getSearchAnalytics(range: DateRange, limit = 20): Promise<SearchRow[] | null> {
  const rows = await callMany<Record<string, unknown>>('analytics_search', {
    ...bounds(range),
    p_limit: limit,
  });
  if (rows === null) return null;
  return rows.map((r) => ({
    term: String(r.term),
    searches: Number(r.searches ?? 0),
    zeroResult: Number(r.zero_result ?? 0),
    lastSeen: String(r.last_seen),
  }));
}

export interface TopAdRow {
  adId: string;
  reference: string;
  title: string;
  category: string | null;
  views: number;
  favourites: number;
  status: string;
  publishedAt: string | null;
}

export async function getTopAdvertisements(range: DateRange, limit = 10): Promise<TopAdRow[] | null> {
  const rows = await callMany<Record<string, unknown>>('analytics_top_ads', {
    ...bounds(range),
    p_limit: limit,
  });
  if (rows === null) return null;
  return rows.map((r) => ({
    adId: String(r.ad_id),
    reference: String(r.reference),
    title: String(r.title),
    category: r.category === null ? null : String(r.category),
    views: Number(r.views ?? 0),
    favourites: Number(r.favourites ?? 0),
    status: String(r.status),
    publishedAt: r.published_at === null ? null : String(r.published_at),
  }));
}

export interface Funnel {
  registered: number;
  posted: number;
  paid: number;
  published: number;
  renewed: number;
}

export async function getUserFunnel(range: DateRange): Promise<Funnel | null> {
  const row = await callOne<Record<string, unknown>>('analytics_funnel', bounds(range));
  if (!row) return null;
  const n = (key: string) => Number(row[key] ?? 0);
  return {
    registered: n('registered'),
    posted: n('posted'),
    paid: n('paid'),
    published: n('published'),
    renewed: n('renewed'),
  };
}

/* ------------------------------------------------------------- derived -- */

/**
 * The rates, computed once, where their definitions can be read.
 *
 * Each returns null rather than zero when its denominator is empty, so a
 * panel can say "nothing was decided in this period" instead of reporting a
 * 0% approval rate that would look like a catastrophe.
 */
export function approvalRate(overview: Overview): number | null {
  if (overview.decisionsMade === 0) return null;
  return overview.decisionsApproved / overview.decisionsMade;
}

export function renewalRate(overview: Overview): number | null {
  if (overview.adsBecameEligible === 0) return null;
  return overview.renewalsRequested / overview.adsBecameEligible;
}

export function paymentSuccessRate(overview: Overview): number | null {
  if (overview.paymentsAttempted === 0) return null;
  return overview.paymentsPaid / overview.paymentsAttempted;
}

/** "62%", or an em dash when there was nothing to divide. */
export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}
