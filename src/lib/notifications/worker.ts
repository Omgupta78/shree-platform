import 'server-only';

import { siteUrl } from '@/lib/env';
import {
  sendTransactionalEmail,
  sendWhatsAppNotification,
  type DeliveryOutcome,
} from '@/lib/notifications/providers';
import { renderEmail, whatsAppParameters } from '@/lib/notifications/templates';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { NotificationDeliveryStatus } from '@/types/database';

/**
 * Draining the outbox.
 *
 * The worker holds no timing logic and no retry counter. It claims a batch,
 * tries each one, and reports what happened; the database decides whether a
 * failure is retried, how long to wait, and when to give up. That division is
 * what lets two workers run at once — a scheduled one and somebody pressing a
 * button — without either of them needing to know about the other.
 *
 * Nothing here can affect an advertisement, a payment or a renewal. It reads
 * the queue and writes the queue, and that is all it is permitted to do.
 */

export interface DrainSummary {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Failures that will be tried again, counted within `failed`. */
  retrying: number;
}

export async function drainNotificationQueue(limit = 25): Promise<DrainSummary> {
  const admin = createSupabaseAdminClient();
  const summary: DrainSummary = { claimed: 0, sent: 0, skipped: 0, failed: 0, retrying: 0 };

  const { data: claimed, error } = await admin.rpc('claim_notification_deliveries', {
    p_limit: limit,
  });

  if (error) {
    console.error('notifications: could not claim work', error.message);
    return summary;
  }
  if (!claimed || claimed.length === 0) return summary;

  summary.claimed = claimed.length;
  const origin = siteUrl();

  // One at a time rather than in parallel. A transactional email provider
  // rate-limits per second, and a burst of twenty-five is the shape of request
  // that earns a 429 — which would then be retried, in a burst, again.
  for (const job of claimed) {
    const message = {
      title: job.title,
      body: job.body,
      recipientName: job.full_name,
      href: job.href,
    };

    let outcome: DeliveryOutcome;
    try {
      if (job.channel === 'email') {
        const email = renderEmail(job.type, message, origin);
        outcome = await sendTransactionalEmail({
          to: job.email ?? '',
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
      } else {
        outcome = await sendWhatsAppNotification({
          to: job.phone ?? '',
          parameters: whatsAppParameters(message, origin),
        });
      }
    } catch (error) {
      // A bug in rendering must not take the queue down with it, and must not
      // be retried for ever either — it will fail identically next time.
      console.error(
        'notifications: could not prepare a message',
        error instanceof Error ? error.message : error,
      );
      outcome = { status: 'failed', reason: 'The message could not be prepared.', retryable: false };
    }

    // A failure the provider will never accept is recorded as `failed`
    // immediately rather than retried four times to reach the same answer.
    const status: NotificationDeliveryStatus =
      outcome.status === 'failed' && !outcome.retryable ? 'failed' : outcome.status;

    const reason = outcome.status === 'sent' ? null : outcome.reason;

    const { data: settled, error: reportError } = await admin.rpc(
      'complete_notification_delivery',
      { p_id: job.delivery_id, p_status: status, p_error: reason },
    );

    if (reportError) {
      // The message may well have been sent. Saying so is more useful than
      // pretending otherwise; the delivery stays claimed and comes back later,
      // which is the one case where a duplicate is possible and preferable to
      // a customer never being told at all.
      console.error('notifications: could not record an outcome', reportError.message);
      continue;
    }

    if (outcome.status === 'sent') summary.sent += 1;
    else if (outcome.status === 'skipped') summary.skipped += 1;
    else {
      summary.failed += 1;
      if (settled === 'queued') summary.retrying += 1;
    }
  }

  return summary;
}

/**
 * The expiring-soon sweep.
 *
 * Separate from the queue drain because it is a different kind of job: it
 * raises notifications rather than sending them. Idempotency is the database's
 * — the reminder keys on the advertisement's expiry date — so this may be run
 * as often as anybody likes.
 */
export async function raiseExpiryReminders(): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('notify_expiring_advertisements');

  if (error) {
    console.error('notifications: expiry reminders failed', error.message);
    return 0;
  }
  return Number(data ?? 0);
}
