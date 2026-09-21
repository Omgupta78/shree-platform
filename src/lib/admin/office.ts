import 'server-only';

import { requireAdministrator, requireStaff } from '@/lib/admin/guard';
import type {
  ActivityEntry,
  AdminCategory,
  AdminReport,
  AdminUser,
} from '@/lib/admin/labels';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  AdminActionRow,
  AdminUserRow,
  ModerationReportRow,
  ReportStatus,
} from '@/types/database';

/*
 * The shapes and the labels live in `labels.ts`, which carries no `server-only`
 * marker, because the tables that render them are Client Components. This
 * module is the half that talks to the database, and it is the half that must
 * never reach the browser.
 */
export type { ActivityEntry, AdminCategory, AdminReport, AdminUser } from '@/lib/admin/labels';
export { ACTION_COPY, EVENT_COPY, REPORT_REASON_COPY, REPORT_STATUS_COPY } from '@/lib/admin/labels';

/**
 * Reports, accounts, categories and the activity log.
 *
 * Grouped in one module because each is a short read against a view that has
 * already decided who may see it, and three files of fifteen lines would only
 * spread the same paragraph across three headers.
 */

/* --------------------------------------------------------- reports ----- */

export async function getReports(status: ReportStatus | 'all'): Promise<AdminReport[]> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  let request = supabase.from('moderation_reports').select('*');
  if (status !== 'all') request = request.eq('status', status);

  const { data } = await request.order('created_at', { ascending: false }).limit(200);

  return ((data ?? []) as unknown as ModerationReportRow[]).map((row) => ({
    id: row.id,
    adId: row.ad_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reporterName: row.reporter_name,
    reviewerName: row.reviewer_name,
    adReference: row.ad_reference,
    adTitle: row.ad_title,
    adStatus: row.ad_status,
  }));
}

/* ----------------------------------------------------------- users ----- */

/**
 * The account list.
 *
 * Administrators only — a moderator reviews advertisements and has no reason
 * to read the customer list. The view already restricts what is returned to
 * the columns the office has a use for; this adds who may ask.
 */
export async function getUsers(search: string): Promise<AdminUser[]> {
  await requireAdministrator();
  const supabase = await createSupabaseServerClient();

  let request = supabase.from('admin_users').select('*');

  const term = search.replace(/["(),*\\]/g, ' ').trim();
  if (term) {
    request = request.or(`full_name.ilike.*${term}*,email.ilike.*${term}*`);
  }

  const { data } = await request.order('created_at', { ascending: false }).limit(200);

  return ((data ?? []) as unknown as AdminUserRow[]).map((row) => ({
    id: row.id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    isBlocked: row.is_blocked,
    createdAt: row.created_at,
    adCount: row.ad_count,
    liveAdCount: row.live_ad_count,
    lastSubmissionAt: row.last_submission_at,
  }));
}

/* ------------------------------------------------------ categories ----- */

export async function getCategories(): Promise<AdminCategory[]> {
  await requireAdministrator();
  const supabase = await createSupabaseServerClient();

  const [categories, counts] = await Promise.all([
    supabase
      .from('categories')
      .select('id, parent_id, slug, name, description, sort_order, is_active')
      .order('sort_order', { ascending: true }),
    supabase.from('moderation_ads').select('category_id, status, expires_at'),
  ]);

  const rows = categories.data ?? [];

  const total = new Map<string, number>();
  const live = new Map<string, number>();
  for (const ad of counts.data ?? []) {
    if (!ad.category_id) continue;
    total.set(ad.category_id, (total.get(ad.category_id) ?? 0) + 1);
    const isLive =
      ad.status === 'approved' && ad.expires_at !== null && new Date(ad.expires_at) > new Date();
    if (isLive) live.set(ad.category_id, (live.get(ad.category_id) ?? 0) + 1);
  }

  const toCategory = (row: (typeof rows)[number]): AdminCategory => ({
    id: row.id,
    parentId: row.parent_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    liveAdCount: live.get(row.id) ?? 0,
    adCount: total.get(row.id) ?? 0,
    children: [],
  });

  const childrenByParent = new Map<string, AdminCategory[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const siblings = childrenByParent.get(row.parent_id) ?? [];
    siblings.push(toCategory(row));
    childrenByParent.set(row.parent_id, siblings);
  }

  return rows
    .filter((row) => row.parent_id === null)
    .map((row) => ({ ...toCategory(row), children: childrenByParent.get(row.id) ?? [] }));
}

/* ---------------------------------------------------- activity log ----- */

export async function getActivity(limit = 100, entityFilter?: string): Promise<ActivityEntry[]> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  let request = supabase.from('admin_actions').select('*');
  if (entityFilter) request = request.eq('entity', entityFilter);

  const { data } = await request.order('occurred_at', { ascending: false }).limit(limit);

  return ((data ?? []) as unknown as AdminActionRow[]).map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    action: row.action,
    event: row.event,
    entity: row.entity,
    entityId: row.entity_id,
    summary: row.summary,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    adReference: row.ad_reference,
    adTitle: row.ad_title,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    note: row.note,
  }));
}
