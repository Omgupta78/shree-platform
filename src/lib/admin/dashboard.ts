import 'server-only';

import { cache } from 'react';

import { requireStaff } from '@/lib/admin/guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AdStatus } from '@/types/database';

/**
 * The dashboard numbers.
 *
 * One round trip for all of them, through `admin_dashboard_counts()`, which
 * counts with `count(*) filter (where ...)` over the indexes. The other way to
 * write this — fetch the advertisements and measure the arrays — works
 * perfectly on the day it is written and is the reason the dashboard takes
 * nine seconds in the second year.
 *
 * Nothing here has a fallback number. If the call fails the page says the
 * figures could not be read, because a dashboard that quietly shows zero
 * pending advertisements is worse than one that shows nothing at all: the
 * office would go home.
 */

export interface DashboardCounts {
  pending: number;
  changes_requested: number;
  approved: number;
  rejected: number;
  expired: number;
  expiring_soon: number;
  submitted_today: number;
  open_reports: number;
  renewals_pending: number;
  users: number;
}

const EMPTY: DashboardCounts = {
  pending: 0,
  changes_requested: 0,
  approved: 0,
  rejected: 0,
  expired: 0,
  expiring_soon: 0,
  submitted_today: 0,
  open_reports: 0,
  renewals_pending: 0,
  users: 0,
};

export const getDashboardCounts = cache(async (): Promise<DashboardCounts | null> => {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('admin_dashboard_counts');
  if (error || !data) return null;

  const counts = { ...EMPTY };
  for (const row of data as Array<{ metric: string; value: number }>) {
    if (row.metric in counts) {
      counts[row.metric as keyof DashboardCounts] = Number(row.value ?? 0);
    }
  }
  return counts;
});

export interface RecentSubmission {
  id: string;
  reference: string;
  title: string;
  categoryName: string | null;
  advertiserName: string;
  createdAt: string;
  status: AdStatus;
  kind: 'classified' | 'display';
}

export const getRecentSubmissions = cache(
  async (limit = 8): Promise<RecentSubmission[]> => {
    await requireStaff();
    const supabase = await createSupabaseServerClient();

    const { data } = await supabase
      .from('moderation_ads')
      .select('id, reference, title, category_name, advertiser_name, created_at, status, kind')
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data ?? []).map((row) => ({
      id: row.id,
      reference: row.reference,
      title: row.title,
      categoryName: row.category_name,
      advertiserName: row.advertiser_name,
      createdAt: row.created_at,
      status: row.status,
      kind: row.kind,
    }));
  },
);

/**
 * What the office should be told when they open the page.
 *
 * Database state, rendered as sentences. Not email, not SMS, not a push
 * notification — those are a later phase, and a notification panel that reads
 * the same table the dashboard reads cannot get out of step with it.
 */
export interface AdminNotice {
  id: string;
  tone: 'urgent' | 'attention' | 'calm';
  message: string;
  href: string;
}

export function buildNotices(counts: DashboardCounts | null): AdminNotice[] {
  if (!counts) return [];
  const notices: AdminNotice[] = [];

  if (counts.pending > 0) {
    notices.push({
      id: 'pending',
      tone: counts.pending >= 10 ? 'urgent' : 'attention',
      message:
        counts.pending === 1
          ? 'One advertisement is waiting for review.'
          : `${counts.pending} advertisements are waiting for review.`,
      href: '/admin/advertisements/pending',
    });
  }

  if (counts.open_reports > 0) {
    notices.push({
      id: 'reports',
      tone: 'urgent',
      message:
        counts.open_reports === 1
          ? 'A reader has reported an advertisement.'
          : `${counts.open_reports} reports are waiting to be looked at.`,
      href: '/admin/reports',
    });
  }

  if (counts.renewals_pending > 0) {
    notices.push({
      id: 'renewals',
      tone: 'attention',
      message:
        counts.renewals_pending === 1
          ? 'One renewal is waiting for a decision.'
          : `${counts.renewals_pending} renewals are waiting for a decision.`,
      href: '/admin/advertisements/renewals',
    });
  }

  if (counts.expiring_soon > 0) {
    notices.push({
      id: 'expiring',
      tone: 'calm',
      message:
        counts.expiring_soon === 1
          ? 'One advertisement is expiring soon.'
          : `${counts.expiring_soon} advertisements are expiring soon.`,
      href: '/admin/advertisements/expiring',
    });
  }

  if (counts.changes_requested > 0) {
    notices.push({
      id: 'changes',
      tone: 'calm',
      message:
        counts.changes_requested === 1
          ? 'One advertiser has been asked for a correction.'
          : `${counts.changes_requested} advertisers have been asked for a correction.`,
      href: '/admin/advertisements/changes-requested',
    });
  }

  if (!notices.length) {
    notices.push({
      id: 'clear',
      tone: 'calm',
      message: 'Nothing is waiting. The queue is clear.',
      href: '/admin/advertisements',
    });
  }

  return notices;
}
