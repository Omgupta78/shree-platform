import 'server-only';

import { requireRazorpayConfig, type RazorpayConfig } from '@/lib/payments/config';
import { verifyPaymentSignature as verifyPaymentSignatureWith } from '@/lib/payments/signature';

/**
 * Razorpay, as much of it as taking a payment needs.
 *
 * This is a client for two endpoints, not a wrapper around the `razorpay` npm
 * package. That package is the official one and its behaviour is what is
 * reproduced here — the algorithms were read out of its source rather than
 * remembered — but what it does for orders is a POST with HTTP Basic auth, and
 * what it does for signatures is an HMAC. Against that, a dependency carrying
 * its own HTTP stack into every server bundle buys little.
 *
 * The signatures themselves live in `signature.ts`, which takes its secrets as
 * arguments and imports nothing: the code that decides whether money arrived
 * is the code that most needs to be testable without a network.
 */

const API_BASE = 'https://api.razorpay.com/v1';

/** Razorpay's receipt field is limited to 40 characters. */
const RECEIPT_MAX = 40;

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt: string | null;
}

export class RazorpayError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'RazorpayError';
    this.status = status;
  }
}

function authHeader(config: RazorpayConfig): string {
  return `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;
}

/**
 * Creates the order the checkout is opened against.
 *
 * The amount is in paise and comes from the caller, which reads it from the
 * database. Nothing in this module ever sees a figure the browser sent.
 */
export async function createRazorpayOrder(input: {
  amountPaise: number;
  currency: string;
  /** The advertisement's reference. Truncated to Razorpay's 40 characters. */
  receipt: string;
  /** Short, non-personal key/value pairs echoed back on the payment. */
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const config = requireRazorpayConfig();

  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new RazorpayError('An order must be for a whole number of paise.', 400);
  }

  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: {
      authorization: authHeader(config),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt.slice(0, RECEIPT_MAX),
      notes: input.notes ?? {},
    }),
    // An order is never cached, and Next must not try.
    cache: 'no-store',
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // Razorpay's own description is useful in a server log and is not
    // something a caller needs; the route turns this into a flat message.
    throw new RazorpayError(razorpayErrorText(body) ?? 'Razorpay refused the order.', response.status);
  }

  const order = body as Partial<RazorpayOrder> | null;
  if (!order || typeof order.id !== 'string' || typeof order.amount !== 'number') {
    throw new RazorpayError('Razorpay returned an order in a shape we do not recognise.', 502);
  }

  return {
    id: order.id,
    amount: order.amount,
    currency: typeof order.currency === 'string' ? order.currency : input.currency,
    status: typeof order.status === 'string' ? order.status : 'created',
    receipt: typeof order.receipt === 'string' ? order.receipt : null,
  };
}

export interface RazorpayPayment {
  id: string;
  orderId: string | null;
  status: string;
  amount: number;
  currency: string;
  errorDescription: string | null;
}

/**
 * Asks Razorpay what actually happened to a payment.
 *
 * Used where their answer is the one that counts and ours may be stale: a
 * browser that came back from the checkout without a signature, or a webhook
 * whose payload we would rather not take at face value.
 */
export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  const config = requireRazorpayConfig();

  const response = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: authHeader(config) },
    cache: 'no-store',
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new RazorpayError(
      razorpayErrorText(body) ?? 'Razorpay would not describe that payment.',
      response.status,
    );
  }

  return readPaymentEntity(body);
}

/** Reads a Razorpay payment entity, from a fetch or from a webhook payload. */
export function readPaymentEntity(value: unknown): RazorpayPayment {
  const entity = value as Record<string, unknown> | null;
  if (!entity || typeof entity.id !== 'string') {
    throw new RazorpayError('That is not a Razorpay payment.', 502);
  }
  const error = entity.error_description;
  return {
    id: entity.id,
    orderId: typeof entity.order_id === 'string' ? entity.order_id : null,
    status: typeof entity.status === 'string' ? entity.status : 'unknown',
    amount: typeof entity.amount === 'number' ? entity.amount : 0,
    currency: typeof entity.currency === 'string' ? entity.currency : 'INR',
    errorDescription: typeof error === 'string' && error.trim() ? error : null,
  };
}

/* ------------------------------------------------------------ signatures -- */

/**
 * The checkout callback, with the secret read from the environment.
 *
 * The arithmetic is in `signature.ts`, which takes its secret as an argument
 * and is therefore testable without an account; this is the thin binding that
 * supplies the configured one.
 */
export function verifyPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  config?: RazorpayConfig;
}): boolean {
  const config = input.config ?? requireRazorpayConfig();
  return verifyPaymentSignatureWith({ ...input, keySecret: config.keySecret });
}

export { verifyWebhookSignature } from '@/lib/payments/signature';

/* ---------------------------------------------------------------- errors -- */

function razorpayErrorText(body: unknown): string | null {
  const envelope = body as { error?: { description?: unknown } } | null;
  const description = envelope?.error?.description;
  return typeof description === 'string' && description.trim() ? description : null;
}
