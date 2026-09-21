import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isSupabaseConfigured } from '@/lib/env';
import { createPaymentOrder } from '@/lib/payments/service';

/**
 * Raises the order a checkout is opened against.
 *
 * What the browser may say is in the schema below, and it is three
 * identifiers: which advertisement, what for, and which renewal. There is no
 * amount, no package price and no currency, because none of those are the
 * browser's to name — `createPaymentOrder()` reads all three from the database
 * and the order is created for what it finds there.
 *
 * What comes back is the order id, the amount the order was actually raised
 * for, and the publishable key. Not the secret, and not anything about the
 * advertiser that Razorpay's checkout does not need.
 */
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  advertisementId: z.uuid(),
  purpose: z.enum(['new_advertisement', 'renewal']).default('new_advertisement'),
  renewalId: z.uuid().nullish(),
});

const GENERIC = 'We could not start the payment. Please try again in a moment.';

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ ok: false, message: 'Payments are not available.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: GENERIC }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: GENERIC }, { status: 400 });
  }

  const { advertisementId, purpose, renewalId } = parsed.data;
  if (purpose === 'renewal' && !renewalId) {
    return NextResponse.json({ ok: false, message: GENERIC }, { status: 400 });
  }

  const result = await createPaymentOrder({
    adId: advertisementId,
    purpose,
    renewalId: renewalId ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, message: result.message },
      { status: statusFor(result.reason) },
    );
  }

  // An unpriced package. The advertisement goes to the queue without a
  // checkout, which is how the whole site works until the office sets rates.
  if (result.order === null) {
    return NextResponse.json({ ok: true, chargeable: false });
  }

  return NextResponse.json({ ok: true, chargeable: true, order: result.order });
}

function statusFor(reason: string): number {
  switch (reason) {
    case 'not_owner':
      return 401;
    case 'not_found':
      return 404;
    case 'no_package':
      return 422;
    case 'unconfigured':
      return 503;
    default:
      return 502;
  }
}
