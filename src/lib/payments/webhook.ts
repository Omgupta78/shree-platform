import 'server-only';

import { razorpayConfig } from '@/lib/payments/config';
import { readPaymentEntity, verifyWebhookSignature } from '@/lib/payments/razorpay';
import { closePayment, settlePayment } from '@/lib/payments/service';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Razorpay's own account of what happened.
 *
 * The browser's callback is the fast path and this is the reliable one. A
 * customer whose connection drops between paying and returning, who closes the
 * tab on the bank's page, or who pays through an app that never comes back to
 * us, is settled here and nowhere else. Neither path is trusted more than the
 * other; both end in `settlePayment()`.
 *
 * Two things make a repeated delivery harmless, and both are needed:
 *
 *   the claim     `payment_webhook_events` is keyed on Razorpay's event id, so
 *                 a retry of an event already handled does not reach the
 *                 business logic at all;
 *   the database  `settle_payment()` is idempotent anyway, so the first
 *                 delivery racing its own retry — or racing the browser's
 *                 callback — still settles exactly once.
 *
 * The claim alone would not be enough: Razorpay retries with the same event id
 * but nothing stops two deliveries being in flight together, and the row is
 * not visible to the second until the first commits.
 */

export type WebhookOutcome =
  | { ok: true; handled: boolean; note: string }
  | { ok: false; status: number; note: string };

/** The events worth acting on. Anything else is recorded and ignored. */
const SETTLING_EVENTS = new Set(['payment.captured', 'order.paid']);
const FAILING_EVENTS = new Set(['payment.failed']);

export async function processRazorpayWebhook(input: {
  rawBody: string;
  signature: string | null;
  eventId: string | null;
}): Promise<WebhookOutcome> {
  const config = razorpayConfig();
  if (!config?.webhookSecret) {
    // Answering 503 rather than 200 means Razorpay keeps the event and retries
    // it once the secret is configured, instead of us losing it quietly.
    return { ok: false, status: 503, note: 'no webhook secret configured' };
  }
  if (!input.signature) {
    return { ok: false, status: 400, note: 'unsigned' };
  }
  if (
    !verifyWebhookSignature({
      rawBody: input.rawBody,
      signature: input.signature,
      webhookSecret: config.webhookSecret,
    })
  ) {
    // 400, not 401: there is nothing to retry. A body that does not verify is
    // not a delivery that failed, it is not a delivery from Razorpay.
    console.warn('razorpay webhook: signature did not verify');
    return { ok: false, status: 400, note: 'bad signature' };
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 400, note: 'unreadable body' };
  }

  const event = typeof body.event === 'string' ? body.event : null;
  if (!event) {
    return { ok: false, status: 400, note: 'no event name' };
  }

  // Razorpay sends `x-razorpay-event-id` on every delivery and repeats it on
  // retries. Without one there is nothing to key idempotency on, so the
  // payment id and event name stand in — repeated work, but never wrong work,
  // because settlement is idempotent underneath.
  const entity = paymentEntity(body);
  const eventId = input.eventId ?? (entity ? `${event}:${entity.id}` : null);
  if (!eventId) {
    return { ok: false, status: 400, note: 'no event id and no payment' };
  }

  const admin = createSupabaseAdminClient();

  // Claim the event. A conflict means it has been handled already.
  const { data: claim, error: claimError } = await admin
    .from('payment_webhook_events')
    .upsert(
      {
        event_id: eventId,
        event,
        provider_order_id: entity?.orderId ?? null,
        provider_payment_id: entity?.id ?? null,
      },
      { onConflict: 'event_id', ignoreDuplicates: true },
    )
    .select('event_id');

  if (claimError) {
    console.error('razorpay webhook: could not record the delivery', claimError.message);
    return { ok: false, status: 500, note: 'could not record the delivery' };
  }
  if (!claim || claim.length === 0) {
    return { ok: true, handled: false, note: 'already handled' };
  }

  const outcome = await act(event, entity);

  if (!outcome.ok) {
    // Release the claim so Razorpay's retry gets another go at it.
    await admin.from('payment_webhook_events').delete().eq('event_id', eventId);
    return outcome;
  }

  await admin
    .from('payment_webhook_events')
    .update({ outcome: outcome.note })
    .eq('event_id', eventId);

  return outcome;
}

type Entity = { id: string; orderId: string | null; status: string; amount: number; reason: string | null };

function paymentEntity(body: Record<string, unknown>): Entity | null {
  const payload = body.payload as { payment?: { entity?: unknown } } | undefined;
  const raw = payload?.payment?.entity;
  if (!raw) return null;
  try {
    const payment = readPaymentEntity(raw);
    return {
      id: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      amount: payment.amount,
      reason: payment.errorDescription,
    };
  } catch {
    return null;
  }
}

async function act(event: string, entity: Entity | null): Promise<WebhookOutcome> {
  if (!SETTLING_EVENTS.has(event) && !FAILING_EVENTS.has(event)) {
    return { ok: true, handled: false, note: `ignored ${event}` };
  }
  if (!entity?.orderId) {
    // An event we would act on, about a payment with no order. Nothing to
    // match it to, and nothing a retry would improve.
    return { ok: true, handled: false, note: 'no order on the payment' };
  }

  if (FAILING_EVENTS.has(event)) {
    const closed = await closePayment({
      orderId: entity.orderId,
      status: 'failed',
      reason: entity.reason ?? 'The payment did not complete.',
    });
    // A payment that is already paid is left alone by `close_payment()`, which
    // is why a late failure notice is not an error here.
    return closed.ok
      ? { ok: true, handled: true, note: `failed -> ${closed.status}` }
      : { ok: false, status: 500, note: 'could not close the payment' };
  }

  const settled = await settlePayment({
    orderId: entity.orderId,
    paymentId: entity.id,
    signature: `webhook:${event}`,
    amountPaise: entity.amount || null,
  });

  return settled.ok
    ? { ok: true, handled: true, note: `settled -> ${settled.status}` }
    : { ok: false, status: 500, note: 'could not settle the payment' };
}
