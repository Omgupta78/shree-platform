import { z } from 'zod';

import type { AdStatus, ModerationAction } from '@/types/database';

/**
 * The vocabulary of a moderation decision, shared by the dialogs and the
 * server action.
 *
 * `moderate_advertisement()` in the database is the authority — it re-checks
 * the role, the transition and the presence of a reason. This module exists so
 * that the interface offers only the decisions that are actually available for
 * the state an advertisement is in, and so that the same words appear in the
 * button, the confirmation and the audit trail.
 */

export const MODERATION_ACTIONS = [
  'approve',
  'reject',
  'request_changes',
  'unpublish',
  'expire',
  'restore',
] as const;

export const moderationActionSchema = z.enum(MODERATION_ACTIONS);

export interface ActionCopy {
  /** The button. */
  label: string;
  /** The confirmation heading. */
  question: string;
  /** What will happen, in one sentence, in the confirmation. */
  consequence: string;
  /** Whether the database will refuse this without a note. */
  requiresNote: boolean;
  tone: 'primary' | 'critical' | 'secondary';
  /** The states this decision can be taken from. Mirrors the SQL. */
  from: readonly AdStatus[];
}

export const ACTIONS: Record<ModerationAction, ActionCopy> = {
  approve: {
    label: 'Approve advertisement',
    question: 'Are you sure you want to approve this advertisement?',
    consequence:
      'It goes live immediately and will be visible to readers, in search and in its category.',
    requiresNote: false,
    tone: 'primary',
    from: ['pending', 'changes_requested'],
  },
  reject: {
    label: 'Reject advertisement',
    question: 'Are you sure you want to reject this advertisement?',
    consequence:
      'It will not be published. The advertiser sees the reason you give on their own page. Nothing is deleted.',
    requiresNote: true,
    tone: 'critical',
    from: ['pending', 'changes_requested', 'approved'],
  },
  request_changes: {
    label: 'Request changes',
    question: 'Send this back to the advertiser for a correction?',
    consequence:
      'It goes back to the advertiser with your message. They can correct it and send it again.',
    requiresNote: true,
    tone: 'secondary',
    from: ['pending'],
  },
  unpublish: {
    label: 'Unpublish',
    question: 'Take this advertisement off the site?',
    consequence:
      'It returns to the review queue and stops being public straight away. It is not deleted.',
    requiresNote: false,
    tone: 'secondary',
    from: ['approved'],
  },
  expire: {
    label: 'Mark as Expired',
    question: 'Why are you expiring this advertisement?',
    consequence:
      'It stops being public now and is marked expired. Nothing is deleted, and the advertiser can renew it.',
    requiresNote: true,
    tone: 'critical',
    // Offered from the lifecycle panel, to administrators only, with its own
    // dialog — not among the everyday review buttons.
    from: [],
  },
  restore: {
    label: 'Restore for review',
    question: 'Put this back in the queue?',
    consequence:
      'It returns to pending so somebody can look at it again. It does not go live on its own.',
    requiresNote: false,
    tone: 'secondary',
    // An expired advertisement comes back through a renewal, which keeps a
    // record of it; restoring would be a renewal without one.
    from: ['rejected', 'sold'],
  },
};

/** The decisions available for an advertisement in this state. */
export function actionsFor(status: AdStatus): ModerationAction[] {
  return MODERATION_ACTIONS.filter((action) => ACTIONS[action].from.includes(status));
}

/**
 * The reasons the office actually gives.
 *
 * A list, because a free-text box alone produces "no" and "not ok", and those
 * are what the advertiser reads. The custom note is appended to whichever is
 * chosen rather than replacing it.
 */
export const REJECTION_REASONS = [
  'Incomplete information',
  'Incorrect category',
  'Inappropriate content',
  'Suspected fraud',
  'Invalid advertisement',
  'Poor quality image',
  'Contact information issue',
  'Other',
] as const;

export const CHANGE_REQUESTS = [
  'Please upload a clearer advertisement image.',
  'Please provide the property location.',
  'Please correct the contact information.',
  'Please choose the correct category.',
  'Please shorten the description.',
  'Other',
] as const;

export const MAX_NOTE = 500;

/**
 * What the server accepts.
 *
 * The advertisement id is checked as a UUID rather than passed through: a
 * string from a form is a string, and `moderate_advertisement('; drop …')`
 * should fail here with a clear message rather than deeper down with an
 * unclear one.
 */
export const moderationInputSchema = z.object({
  advertisementId: z.uuid(),
  action: moderationActionSchema,
  note: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(MAX_NOTE, `Please keep this to ${MAX_NOTE} characters or fewer.`)),
});

export const bulkModerationInputSchema = z.object({
  // Capped so one click cannot queue a thousand round trips. The queue page
  // shows 25 at a time, which is where the number comes from.
  advertisementIds: z.array(z.uuid()).min(1).max(25),
  action: z.enum(['approve', 'reject']),
  note: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(MAX_NOTE)),
});

/** Status labels for the admin badges. One vocabulary across every table. */
export const ADMIN_STATUS_COPY: Record<
  AdStatus,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'featured' }
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  changes_requested: { label: 'Changes requested', tone: 'featured' },
  expired: { label: 'Expired', tone: 'neutral' },
  sold: { label: 'Sold', tone: 'neutral' },
};
