import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isSupabaseConfigured } from '@/lib/env';
import { cancelCheckout, verifyCheckoutPayment } from '@/lib/payments/service';

/**
 * Where the checkout comes back to.
 *
 * The three fields Razorpay hands the browser are re-checked here against the
 * account secret, which the browser does not have and must never be given.
 * Whatever the browser believes happened is irrelevant: a request claiming
 * success with a signature that does not verify changes nothing, and a
 * request claiming failure for somebody else's order finds no such order.
 *
 * Nothing here decides whether the advertisement may be published. Payment
 * and moderation are separate states, and a paid advertisement is still
 * `pending` until somebody at the office reads it.
 */
export const dynamic = 'force-dynamic';

const verifySchema = z.object({
  action: z.literal('verify').default('verify'),
  razorpayOrderId: z.string().min(4).max(120),
  razorpayPaymentId: z.string().min(4).max(120),
  razorpaySignature: z.string().min(16).max(256),
});

const cancelSchema = z.object({
  action: z.literal('cancel'),
  razorpayOrderId: z.string().min(4).max(120),
});

const bodySchema = z.union([cancelSchema, verifySchema]);

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ ok: false, message: 'Payments are not available.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Unreadable request.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Unreadable request.' }, { status: 400 });
  }

  const result =
    parsed.data.action === 'cancel'
      ? await cancelCheckout(parsed.data.razorpayOrderId)
      : await verifyCheckoutPayment({
          orderId: parsed.data.razorpayOrderId,
          paymentId: parsed.data.razorpayPaymentId,
          signature: parsed.data.razorpaySignature,
        });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, message: result.message },
      { status: result.reason === 'not_found' ? 404 : result.reason === 'signature' ? 400 : 502 },
    );
  }

  return NextResponse.json({ ok: true, status: result.status });
}
