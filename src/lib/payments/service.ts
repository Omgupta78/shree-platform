import 'server-only';

import type { PaymentPurpose, PaymentStatus } from '@/types/database';
import { isChargeable, razorpayConfig } from '@/lib/payments/config';
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  RazorpayError,
  verifyPaymentSignature,
} from '@/lib/payments/razorpay';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Everything that decides whether an advertiser has paid.
 *
 * One module, because the alternative is the failure Phase 9 was told to avoid
 * by name: business logic implemented twice, slightly differently, once for
 * the browser's callback and once for the webhook. Both of those arrive here,
 * and both leave through `settlePayment()`.
 *
 * The division of labour with the database is worth stating, because it is
 * what makes the rest of this file short:
 *
 *   this module      is the signature genuine? is the caller the owner?
 *   the database     what does it cost, may it move to this state, has it
 *                    already been settled, and is the amount the one we raised?
 *
 * So there is no "if already paid" branch below. `settle_payment()` answers
 * that, under a row lock, and answers it the same way for the second tab, the
 * refresh, the retried webhook and the callback that raced its own webhook.
 */

const PROVIDER = 'razorpay';

export type PaymentFailure =
  | 'unconfigured'
  | 'not_found'
  | 'not_owner'
  | 'no_package'
  | 'not_chargeable'
  | 'provider'
  | 'signature'
  | 'failed';

export interface PaymentOrder {
  paymentId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  /** Razorpay's publishable key id, sent with the order it belongs to. */
  keyId: string;
  packageName: string;
  adReference: string;
  adTitle: string;
}

export type CreateOrderResult =
  | { ok: true; order: PaymentOrder }
  /** The package costs nothing, so there is nothing to collect. */
  | { ok: true; order: null; reason: 'not_chargeable' }
  | { ok: false; reason: PaymentFailure; message: string };

/**
 * Raises an order for an advertisement, or says why it cannot.
 *
 * The sequence matters. The payment row is inserted FIRST, so that the amount
 * is stamped by the database from the package; only then is the Razorpay order
 * created, for that stamped amount. A client that names a price names it into
 * a column that is overwritten before it is stored, and the figure the
 * checkout displays is the figure the order was created for.
 */
export async function createPaymentOrder(input: {
  adId: string;
  purpose: PaymentPurpose;
  renewalId?: string | null;
}): Promise<CreateOrderResult> {
  const config = razorpayConfig();
  const supabase = await createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) {
    return { ok: false, reason: 'not_owner', message: 'Please sign in to pay for this advertisement.' };
  }

  // Ownership is the database's answer: `owner_ads` filters on auth.uid().
  const { data: ad } = await supabase
    .from('owner_ads')
    .select('id, reference, title, package_id')
    .eq('id', input.adId)
    .maybeSingle();

  if (!ad) {
    return { ok: false, reason: 'not_found', message: 'No such advertisement.' };
  }

  // An attempt already open for this advertisement and purpose is reused
  // rather than replaced: a second order would leave the office looking at two
  // and a late webhook settling the one nobody is waiting on.
  // Scoped to the renewal as well as the advertisement. An advertisement can
  // be renewed more than once, and an attempt abandoned on the first renewal
  // must not be handed to the second — paying it would settle a payment
  // attached to the wrong renewal, and the new one would stay unapprovable
  // with the advertiser insisting, correctly, that they had paid.
  const openAttempt = supabase
    .from('payments')
    .select('id, amount_paise, currency, provider_order_id, package_name, status')
    .eq('ad_id', input.adId)
    .eq('purpose', input.purpose)
    .in('status', ['created', 'pending']);

  const { data: existing } = await (input.purpose === 'renewal'
    ? openAttempt.eq('renewal_id', input.renewalId ?? '')
    : openAttempt.is('renewal_id', null)
  ).maybeSingle();

  let paymentId = existing?.id ?? null;
  let amountPaise = existing?.amount_paise ?? null;
  let currency = existing?.currency ?? 'INR';
  let packageName = existing?.package_name ?? null;
  let orderId = existing?.provider_order_id ?? null;

  if (!paymentId) {
    // The four values sent here are required because the columns are NOT NULL.
    // `stamp_payment_amount()` overwrites every one of them.
    const { data: created, error } = await supabase
      .from('payments')
      .insert({
        ad_id: input.adId,
        user_id: user.id,
        package_id: ad.package_id ?? 'basic',
        amount_paise: 0,
        purpose: input.purpose,
        renewal_id: input.renewalId ?? null,
      })
      .select('id, amount_paise, currency, package_name')
      .single();

    if (error || !created) {
      return {
        ok: false,
        reason: 'no_package',
        message: 'This advertisement has no package to pay for.',
      };
    }
    paymentId = created.id;
    amountPaise = created.amount_paise;
    currency = created.currency;
    packageName = created.package_name;
  }

  if (!isChargeable(amountPaise)) {
    return { ok: true, order: null, reason: 'not_chargeable' };
  }
  if (!config) {
    return {
      ok: false,
      reason: 'unconfigured',
      message: 'Online payment is not available just now. Please contact the office.',
    };
  }

  if (!orderId) {
    try {
      const order = await createRazorpayOrder({
        amountPaise: amountPaise as number,
        currency,
        receipt: ad.reference,
        // Notes are echoed back on the payment and are visible in the
        // Razorpay dashboard. Our own identifiers only — nothing about the
        // advertiser goes into somebody else's system for our convenience.
        notes: { payment_id: paymentId, purpose: input.purpose, reference: ad.reference },
      });
      orderId = order.id;
    } catch (error) {
      console.error(
        'razorpay: could not create an order',
        error instanceof Error ? error.message : error,
      );
      return {
        ok: false,
        reason: 'provider',
        message: 'We could not reach the payment provider. Please try again in a moment.',
      };
    }

    // The owner may attach the provider's order id to their own payment; the
    // settlement guard is what stops them touching the amount or the status.
    const { error: attachError } = await supabase
      .from('payments')
      .update({ provider: PROVIDER, provider_order_id: orderId })
      .eq('id', paymentId);

    if (attachError) {
      console.error('razorpay: could not record the order', attachError.message);
      return {
        ok: false,
        reason: 'provider',
        message: 'We could not start the payment. Please try again in a moment.',
      };
    }
  }

  return {
    ok: true,
    order: {
      paymentId,
      orderId,
      amountPaise: amountPaise as number,
      currency,
      keyId: config.keyId,
      packageName: packageName ?? 'Advertisement',
      adReference: ad.reference,
      adTitle: ad.title,
    },
  };
}

export type SettleResult =
  | { ok: true; status: PaymentStatus }
  | { ok: false; reason: PaymentFailure; message: string };

/**
 * The checkout came back. Is it genuine, and is it this advertiser's?
 *
 * Both questions are asked before anything is written. The signature is the
 * cryptographic one — only somebody holding the account secret could have
 * produced it, which is why this cannot be done in the browser. Ownership is
 * the ordinary one, asked of `my_payments`, whose WHERE clause is the answer:
 * without it, anyone could post a well-formed callback for somebody else's
 * order and mark their payment failed.
 */
export async function verifyCheckoutPayment(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<SettleResult> {
  const config = razorpayConfig();
  if (!config) {
    return { ok: false, reason: 'unconfigured', message: 'Payments are not configured.' };
  }

  // Ownership and existence in one question, asked of the table through the
  // advertiser's own client: `payments_select` is `user_id = auth.uid()`, so
  // another advertiser's order simply is not there to be found.
  const supabase = await createSupabaseServerClient();
  const { data: owned } = await supabase
    .from('payments')
    .select('id')
    .eq('provider_order_id', input.orderId)
    .maybeSingle();

  if (!owned) {
    return { ok: false, reason: 'not_found', message: 'No payment is waiting on that order.' };
  }

  if (!verifyPaymentSignature({ ...input, config })) {
    // Not a failed payment — a callback that did not come from Razorpay.
    // Nothing is written: an unsigned message must not be able to change the
    // state of a payment, in either direction.
    console.warn('razorpay: a checkout callback failed signature verification');
    return {
      ok: false,
      reason: 'signature',
      message: 'We could not verify that payment. Nothing has been charged twice — please contact the office.',
    };
  }

  // The signature proves Razorpay sent it. Their record of the payment is
  // what says how much was actually collected, and it is passed to the
  // database so the amount is checked against the order we raised.
  let collectedPaise: number | null = null;
  try {
    const payment = await fetchRazorpayPayment(input.paymentId);
    if (payment.status === 'failed') {
      return await closePayment({
        orderId: input.orderId,
        status: 'failed',
        reason: payment.errorDescription ?? 'The payment did not complete.',
      });
    }
    collectedPaise = payment.amount;
  } catch (error) {
    // Razorpay is unreachable, but the signature is proof enough that this
    // payment is theirs and ours. Settling on it is right; the amount check is
    // the only thing given up, and the webhook will repeat the whole exercise.
    console.error(
      'razorpay: could not confirm the payment, settling on the signature alone',
      error instanceof RazorpayError ? error.message : error,
    );
  }

  return settlePayment({
    orderId: input.orderId,
    paymentId: input.paymentId,
    signature: input.signature,
    amountPaise: collectedPaise,
  });
}

/* ------------------------------------------------- the one way to settle -- */

/**
 * Marks a payment paid. The only caller of `settle_payment()`.
 *
 * Reached from the browser's callback and from the webhook, which is the
 * point: whichever arrives first settles, and whichever arrives second is told
 * calmly that it is already settled.
 */
export async function settlePayment(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  amountPaise?: number | null;
}): Promise<SettleResult> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc('settle_payment', {
    p_provider: PROVIDER,
    p_provider_order_id: input.orderId,
    p_payment_id: input.paymentId,
    p_signature: input.signature,
    p_amount_paise: input.amountPaise ?? null,
  });

  if (error) {
    console.error('payments: settlement refused', error.message);
    return {
      ok: false,
      reason: 'failed',
      message: 'We could not record that payment. Please contact the office before paying again.',
    };
  }

  return { ok: true, status: data as PaymentStatus };
}

/** Records a failed or dismissed attempt. The only caller of `close_payment()`. */
export async function closePayment(input: {
  orderId: string;
  status: Extract<PaymentStatus, 'failed' | 'cancelled'>;
  reason?: string | null;
}): Promise<SettleResult> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc('close_payment', {
    p_provider: PROVIDER,
    p_provider_order_id: input.orderId,
    p_status: input.status,
    p_reason: input.reason ?? null,
  });

  if (error) {
    console.error('payments: could not close the attempt', error.message);
    return { ok: false, reason: 'failed', message: 'We could not record that attempt.' };
  }

  return { ok: true, status: data as PaymentStatus };
}

/**
 * The advertiser closed the checkout window.
 *
 * Ownership is checked before anything is written, for the same reason as in
 * `verifyCheckoutPayment()`: "I closed the window" is a claim anybody can
 * make about anybody's order.
 */
export async function cancelCheckout(orderId: string): Promise<SettleResult> {
  const supabase = await createSupabaseServerClient();
  const { data: owned } = await supabase
    .from('payments')
    .select('id')
    .eq('provider_order_id', orderId)
    .maybeSingle();

  if (!owned) {
    return { ok: false, reason: 'not_found', message: 'No payment is waiting on that order.' };
  }

  return closePayment({ orderId, status: 'cancelled' });
}
