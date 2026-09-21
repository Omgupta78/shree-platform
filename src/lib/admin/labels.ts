import type {
  AdminUserRow,
  AdminActionRow,
  ModerationReportRow,
  ReportStatus,
} from '@/types/database';

/**
 * The shapes and the words the admin screens use.
 *
 * Split out of `office.ts` because that module is `server-only` — it opens a
 * Supabase client — and the report table, the user table and the category
 * editor are Client Components that need the same labels. Importing a
 * `server-only` module from a Client Component is a build error, and rightly
 * so: it would mean shipping a server data-access module to the browser.
 *
 * Nothing here reaches a database. It is types and text.
 */

/* --------------------------------------------------------- reports ----- */

export interface AdminReport {
  id: string;
  adId: string;
  reason: ModerationReportRow['reason'];
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  reviewedAt: string | null;
  reporterName: string | null;
  reviewerName: string | null;
  adReference: string | null;
  adTitle: string | null;
  adStatus: ModerationReportRow['ad_status'];
}

export const REPORT_STATUS_COPY: Record<
  ReportStatus,
  { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }
> = {
  open: { label: 'Open', tone: 'warning' },
  reviewing: { label: 'Being looked at', tone: 'warning' },
  // The database calls this `actioned` — "we did something about it" — which
  // is more precise than "resolved", since dismissing a report also resolves
  // it. The office reads the plainer word.
  actioned: { label: 'Resolved', tone: 'success' },
  dismissed: { label: 'Dismissed', tone: 'neutral' },
};

export const REPORT_REASON_COPY: Record<ModerationReportRow['reason'], string> = {
  spam: 'Spam',
  fraud: 'Fraud or suspicious',
  incorrect: 'Incorrect information',
  offensive: 'Offensive content',
  unavailable: 'No longer available',
  other: 'Other',
};

/* ----------------------------------------------------------- users ----- */

export interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  role: AdminUserRow['role'];
  isBlocked: boolean;
  createdAt: string;
  adCount: number;
  liveAdCount: number;
  lastSubmissionAt: string | null;
}

/* ------------------------------------------------------ categories ----- */

export interface AdminCategory {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Live advertisements in this category — what makes deactivating it visible. */
  liveAdCount: number;
  adCount: number;
  children: AdminCategory[];
}

/* ---------------------------------------------------- activity log ----- */

export interface ActivityEntry {
  id: number;
  occurredAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string | null;
  actorName: string | null;
  actorRole: AdminActionRow['actor_role'];
  adReference: string | null;
  adTitle: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  note: string | null;
  /** Lifecycle event name, when the entry has one. */
  event: string | null;
}

/** How each audited action reads in a sentence. */
export const ACTION_COPY: Record<string, string> = {
  'ad.created': 'submitted an advertisement',
  'ad.status_changed': 'changed an advertisement\u2019s status',
  'ad.featured_changed': 'changed featured placement',
  'ad.edited_by_staff': 'edited an advertisement',
  'profile.role_changed': 'changed a role',
  'profile.block_changed': 'changed an account\u2019s status',
  'payment.created': 'raised a payment',
  'payment.status_changed': 'settled a payment',
  'report.status_changed': 'acted on a report',
  'ad.renewal_requested': 'asked for a renewal',
  'ad.renewal_approved': 'approved a renewal',
  'ad.renewal_rejected': 'refused a renewal',
  'ad.renewal_withdrawn': 'withdrew a renewal',
  'ad.expiry_extended': 'extended the expiry',
};

/**
 * Lifecycle event names, from `audit_log.after->>'event'`. Where an entry has
 * one, it says more than the action does: "expired it automatically" rather
 * than "changed an advertisement's status".
 */
export const EVENT_COPY: Record<string, string> = {
  created: 'created it as a draft',
  submitted: 'submitted it',
  resubmitted: 'resubmitted it',
  published: 'approved and published it',
  republished: 'approved and published it for a new run',
  rejected: 'rejected it',
  changes_requested: 'requested changes',
  unpublished: 'unpublished it',
  restored: 'restored it for review',
  expired: 'marked it expired',
  expired_automatically: 'expired it automatically at the end of its run',
  expired_manually: 'manually expired it',
  marked_sold: 'marked it sold',
  withdrawn: 'withdrew it',
  renewal_requested: 'asked for a renewal',
  renewal_review: 'returned it to the queue for renewal review',
  renewal_approved: 'approved a renewal',
  renewal_rejected: 'refused a renewal',
  renewal_withdrawn: 'withdrew a renewal',
  expiry_extended: 'extended its expiry',
};
