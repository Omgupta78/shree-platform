import { z } from 'zod';

import type { AdStatus } from '@/types/database';

/**
 * Editing an advertisement that has already been sent.
 *
 * This module holds only what the *edit* adds on top of a submission: which
 * states can be edited, which of them mean "send it back", and the small
 * envelope around the payload. The payload itself is validated with
 * `classifiedSubmissionSchema` and `displaySubmissionSchema` — the very
 * schemas the submission form and the submission action already use — so
 * there is exactly one definition of what a valid advertisement is, and an
 * edit cannot produce something the original form would have refused.
 */

/**
 * The states an advertiser may edit from.
 *
 * `expired` and `sold` are absent. Reviving a finished advertisement is a
 * renewal, and a renewal is paid for; the route back is the office restoring
 * it. `approved` is present, and editing one sends it back for review — a
 * database trigger does that, not this list, which is why the form warns
 * before it happens rather than pretending otherwise.
 */
export const EDITABLE_STATUSES: readonly AdStatus[] = [
  'draft',
  'pending',
  'changes_requested',
  'rejected',
  'approved',
];

export function isEditable(status: AdStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/**
 * The states where saving should also put the advertisement back in the
 * queue.
 *
 * A `pending` advertisement is already in the queue, and an `approved` one is
 * returned by the trigger, so neither needs — or gets — a second button.
 */
export function canResubmit(status: AdStatus): boolean {
  return status === 'draft' || status === 'changes_requested' || status === 'rejected';
}

/** What the office is waiting for, said to the advertiser. */
export function editIntroFor(status: AdStatus): string {
  switch (status) {
    case 'changes_requested':
      return 'Make the change our office asked for, then send it back. It returns to the review queue, not straight to the site.';
    case 'rejected':
      return 'You can correct this and send it again. It goes back to the review queue and somebody will look at it afresh.';
    case 'approved':
      return 'This advertisement is live. Saving a change to the title, the description, the price or the category takes it off the site and back into the review queue until somebody has read it.';
    case 'pending':
      return 'This is already with our office. Anything you change here is what they will see.';
    default:
      return 'A draft. Nothing has been sent to our office yet.';
  }
}

export const MAX_REMOVED_IMAGES = 8;

/**
 * The envelope, not the advertisement.
 *
 * `advertisementId` is checked as a UUID rather than passed through, and the
 * photographs to remove are ids the server re-checks against that
 * advertisement — a list of ids from a browser is a list of ids from a
 * browser, and the one thing it must not be able to do is delete a
 * photograph belonging to somebody else's advertisement.
 */
export const editEnvelopeSchema = z.object({
  advertisementId: z.uuid(),
  removeImageIds: z.array(z.uuid()).max(MAX_REMOVED_IMAGES),
  resubmit: z.boolean(),
});

export interface EditResult {
  ok: boolean;
  /** Where to send the browser on success. */
  redirectTo?: string;
  message?: string;
  code?: 'auth' | 'invalid' | 'upload' | 'unavailable' | 'failed' | 'not-editable';
}
