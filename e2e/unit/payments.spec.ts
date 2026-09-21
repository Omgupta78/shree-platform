import { createHmac } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { isChargeable, MINIMUM_CHARGEABLE_PAISE } from '../../src/lib/payments/amounts';
import {
  paymentSignature,
  verifyPaymentSignature,
  verifyWebhookSignature,
  webhookSignature,
} from '../../src/lib/payments/signature';
import { formatPaise, formatPaiseAsRupees } from '../../src/lib/format';

/**
 * The payment signatures, as pure functions. No browser and no account: these
 * run in Node against known digests.
 *
 * The expected values below are computed here with `node:crypto` directly
 * rather than copied from the implementation, so that a change to the
 * implementation cannot quietly change what the test expects. The FORM being
 * asserted — `order|payment` keyed with the key secret, and the raw body keyed
 * with the webhook secret — is Razorpay's, taken from their official package.
 */

const KEY_SECRET = 'rzp_test_secret_value_for_checks';
const WEBHOOK_SECRET = 'webhook_secret_value_for_checks';

test.describe('the checkout callback signature', () => {
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';

  test('is an HMAC of order and payment joined by a pipe', () => {
    const expected = createHmac('sha256', KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    expect(paymentSignature({ orderId, paymentId, keySecret: KEY_SECRET })).toBe(expected);
  });

  test('a genuine signature verifies', () => {
    const signature = paymentSignature({ orderId, paymentId, keySecret: KEY_SECRET });
    expect(verifyPaymentSignature({ orderId, paymentId, signature, keySecret: KEY_SECRET })).toBe(true);
  });

  test('a signature made with another secret does not', () => {
    const signature = paymentSignature({ orderId, paymentId, keySecret: 'not-our-secret' });
    expect(verifyPaymentSignature({ orderId, paymentId, signature, keySecret: KEY_SECRET })).toBe(false);
  });

  test('a signature for another order does not', () => {
    const signature = paymentSignature({ orderId: 'order_OTHER', paymentId, keySecret: KEY_SECRET });
    expect(verifyPaymentSignature({ orderId, paymentId, signature, keySecret: KEY_SECRET })).toBe(false);
  });

  test('a signature for another payment does not — a captured one cannot be reused', () => {
    const signature = paymentSignature({ orderId, paymentId: 'pay_SOMEONE_ELSE', keySecret: KEY_SECRET });
    expect(verifyPaymentSignature({ orderId, paymentId, signature, keySecret: KEY_SECRET })).toBe(false);
  });

  test('the order and the payment are not interchangeable', () => {
    // Razorpay's own ids are alphanumeric and carry no pipe, so the separator
    // makes the pair unambiguous: swapping the two is a different digest.
    const one = paymentSignature({ orderId: 'order_A', paymentId: 'pay_B', keySecret: KEY_SECRET });
    const two = paymentSignature({ orderId: 'pay_B', paymentId: 'order_A', keySecret: KEY_SECRET });
    expect(one).not.toBe(two);
  });

  test('nothing missing is ever accepted', () => {
    const signature = paymentSignature({ orderId, paymentId, keySecret: KEY_SECRET });
    expect(verifyPaymentSignature({ orderId: '', paymentId, signature, keySecret: KEY_SECRET })).toBe(false);
    expect(verifyPaymentSignature({ orderId, paymentId: '', signature, keySecret: KEY_SECRET })).toBe(false);
    expect(verifyPaymentSignature({ orderId, paymentId, signature: '', keySecret: KEY_SECRET })).toBe(false);
    expect(verifyPaymentSignature({ orderId, paymentId, signature, keySecret: '' })).toBe(false);
  });

  test('a signature of the wrong length is refused rather than throwing', () => {
    // timingSafeEqual throws on a length mismatch; the length check comes first.
    expect(() =>
      verifyPaymentSignature({ orderId, paymentId, signature: 'abc', keySecret: KEY_SECRET }),
    ).not.toThrow();
    expect(verifyPaymentSignature({ orderId, paymentId, signature: 'abc', keySecret: KEY_SECRET })).toBe(false);
  });
});

test.describe('the webhook signature', () => {
  const body = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 19900 } } },
  });

  test('is an HMAC of the raw body under the webhook secret', () => {
    const expected = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
    expect(webhookSignature({ rawBody: body, webhookSecret: WEBHOOK_SECRET })).toBe(expected);
  });

  test('a genuine delivery verifies', () => {
    const signature = webhookSignature({ rawBody: body, webhookSecret: WEBHOOK_SECRET });
    expect(verifyWebhookSignature({ rawBody: body, signature, webhookSecret: WEBHOOK_SECRET })).toBe(true);
  });

  test('the key secret is not the webhook secret', () => {
    const signature = webhookSignature({ rawBody: body, webhookSecret: KEY_SECRET });
    expect(verifyWebhookSignature({ rawBody: body, signature, webhookSecret: WEBHOOK_SECRET })).toBe(false);
  });

  test('a body that has been parsed and re-serialised does not verify', () => {
    // The reason the route reads request.text() and never request.json().
    const signature = webhookSignature({ rawBody: body, webhookSecret: WEBHOOK_SECRET });
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    expect(reserialised).not.toBe(body);
    expect(
      verifyWebhookSignature({ rawBody: reserialised, signature, webhookSecret: WEBHOOK_SECRET }),
    ).toBe(false);
  });

  test('a body altered by one character does not verify', () => {
    const signature = webhookSignature({ rawBody: body, webhookSecret: WEBHOOK_SECRET });
    const tampered = body.replace('19900', '19901');
    expect(verifyWebhookSignature({ rawBody: tampered, signature, webhookSecret: WEBHOOK_SECRET })).toBe(false);
  });

  test('an unsigned delivery is refused', () => {
    expect(verifyWebhookSignature({ rawBody: body, signature: '', webhookSecret: WEBHOOK_SECRET })).toBe(false);
    expect(verifyWebhookSignature({ rawBody: '', signature: 'x', webhookSecret: WEBHOOK_SECRET })).toBe(false);
  });
});

test.describe('what is worth charging for', () => {
  test('an unpriced package is not chargeable', () => {
    expect(isChargeable(null)).toBe(false);
    expect(isChargeable(undefined)).toBe(false);
    expect(isChargeable(0)).toBe(false);
  });

  test('below one rupee is not chargeable, because Razorpay will not take it', () => {
    expect(MINIMUM_CHARGEABLE_PAISE).toBe(100);
    expect(isChargeable(99)).toBe(false);
    expect(isChargeable(100)).toBe(true);
    expect(isChargeable(19900)).toBe(true);
  });
});

test.describe('money on the page', () => {
  test('paise are shown in full on a receipt', () => {
    expect(formatPaise(19900)).toBe('₹199.00');
    expect(formatPaise(49950)).toBe('₹499.50');
    expect(formatPaise(0)).toBe('₹0.00');
  });

  test('a package price is shown in whole rupees, grouped the Indian way', () => {
    expect(formatPaiseAsRupees(19900)).toBe('₹199');
    expect(formatPaiseAsRupees(10000000)).toBe('₹1,00,000');
  });

  test('an amount that is not a number is shown as nothing, not as zero', () => {
    expect(formatPaise(null)).toBe('');
    expect(formatPaiseAsRupees(undefined)).toBe('');
  });
});
