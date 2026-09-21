import { NextResponse } from 'next/server';

import { isSupabaseConfigured } from '@/lib/env';
import { processRazorpayWebhook } from '@/lib/payments/webhook';

/**
 * Razorpay's webhook.
 *
 * The body is read with `request.text()` and handed on as the string it
 * arrived as. That is not an implementation detail to tidy up later: the
 * signature is an HMAC over those exact bytes, and a body that has been
 * through `JSON.parse` and back is a different sequence of bytes. Parsing
 * before verifying is the single most common way this check is got wrong, and
 * it fails in the worst possible direction — every delivery rejected, or, if
 * somebody then "fixes" it by skipping the check, every delivery accepted.
 *
 * Configure it in the Razorpay dashboard against `payment.captured`,
 * `payment.failed` and `order.paid`, with the secret in
 * `RAZORPAY_WEBHOOK_SECRET`.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSupabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const rawBody = await request.text();

  const result = await processRazorpayWebhook({
    rawBody,
    signature: request.headers.get('x-razorpay-signature'),
    eventId: request.headers.get('x-razorpay-event-id'),
  });

  if (!result.ok) {
    // The note says what went wrong for our own logs; the body Razorpay sees
    // says nothing, because a webhook endpoint that describes why a signature
    // failed is a webhook endpoint that helps somebody forge one.
    console.warn('razorpay webhook rejected:', result.note);
    return NextResponse.json({ ok: false }, { status: result.status });
  }

  return NextResponse.json({ ok: true, handled: result.handled });
}
