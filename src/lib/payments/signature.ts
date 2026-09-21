import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The two Razorpay signatures, as pure functions.
 *
 * Deliberately separate from `razorpay.ts`, and deliberately without
 * `server-only`: these take their secret as an argument and hold none of their
 * own, so they can be exercised directly by a test runner in Node. The code
 * that decides whether money arrived is the code that most needs to be
 * testable without a network and without a live account.
 *
 * The two are different and are easy to confuse:
 *
 *   checkout callback   HMAC-SHA256(`${order_id}|${payment_id}`, KEY_SECRET)
 *   webhook delivery    HMAC-SHA256(raw request body, WEBHOOK_SECRET)
 *
 * Different secrets, different inputs. Both hex, both compared in constant
 * time. The algorithms are Razorpay's own, read out of the official
 * `razorpay` package rather than remembered.
 */

/**
 * Compares two digests without leaking, through timing, how much of one
 * matched. `timingSafeEqual` throws on a length mismatch, so length is checked
 * first — and that tells an attacker nothing, since the length of a SHA-256
 * digest is not a secret.
 */
export function digestsMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The digest Razorpay sends back with a successful checkout. */
export function paymentSignature(input: {
  orderId: string;
  paymentId: string;
  keySecret: string;
}): string {
  return createHmac('sha256', input.keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest('hex');
}

/**
 * The checkout callback.
 *
 * Only somebody holding the account secret could have produced this, which is
 * the whole reason the check cannot be done in the browser however convenient
 * that would be.
 */
export function verifyPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  if (!input.orderId || !input.paymentId || !input.signature || !input.keySecret) return false;
  return digestsMatch(paymentSignature(input), input.signature);
}

/** The digest Razorpay sends in `X-Razorpay-Signature` on a webhook delivery. */
export function webhookSignature(input: { rawBody: string; webhookSecret: string }): string {
  return createHmac('sha256', input.webhookSecret).update(input.rawBody).digest('hex');
}

/**
 * A webhook delivery.
 *
 * `rawBody` must be the body exactly as it arrived. A body that has been
 * parsed and re-serialised is a different sequence of bytes and will not
 * verify — the most common way this check is got wrong, and one that fails in
 * the worst direction, because the obvious "fix" is to stop checking.
 */
export function verifyWebhookSignature(input: {
  rawBody: string;
  signature: string;
  webhookSecret: string;
}): boolean {
  if (!input.rawBody || !input.signature || !input.webhookSecret) return false;
  return digestsMatch(webhookSignature(input), input.signature);
}
