/**
 * What is worth charging for.
 *
 * Pure, and free of `server-only`, because both sides need it: the package
 * step decides in the browser whether to show a price or "rate on
 * application", and the order endpoint decides on the server whether to open a
 * checkout at all. One rule, in one place, so the two cannot disagree about
 * whether an advertisement has anything to pay.
 */

/**
 * Razorpay refuses an order below one rupee, so a package priced under that
 * cannot be charged for and is treated as unpriced.
 */
export const MINIMUM_CHARGEABLE_PAISE = 100;

/**
 * True when this amount is worth sending to a checkout.
 *
 * NULL is the ordinary case today and means "the office has not quoted a
 * rate". It is not zero, and the interface says so rather than showing a
 * customer a free advertisement nobody offered them.
 */
export function isChargeable(amountPaise: number | null | undefined): boolean {
  return typeof amountPaise === 'number' && amountPaise >= MINIMUM_CHARGEABLE_PAISE;
}
