/**
 * Razorpay Checkout, as seen from the browser.
 *
 * The whole of our dealings with their script is here: loading it once,
 * describing the options it takes, and turning its two callbacks into a
 * promise with three possible endings. Nothing else in the application knows
 * that a global called `Razorpay` exists.
 *
 * What this deliberately does NOT do is decide anything. It does not know what
 * the advertisement costs — the amount it displays is the one the server
 * created the order for — and its answer is never believed on its own: the
 * signature it returns goes straight to `/api/payments/verify`, which checks
 * it against a secret this file has no access to.
 */

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

export interface CheckoutOrder {
  orderId: string;
  keyId: string;
  amountPaise: number;
  currency: string;
  packageName: string;
  adReference: string;
  adTitle: string;
}

export type CheckoutOutcome =
  | { kind: 'paid'; orderId: string; paymentId: string; signature: string }
  /** The advertiser closed the window. Not a failure, and told apart from one. */
  | { kind: 'dismissed'; orderId: string }
  | { kind: 'failed'; orderId: string; reason: string };

/* -------------------------------------------- the shape of their script -- */

interface RazorpayHandlerResponse {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
}

interface RazorpayFailure {
  error?: { description?: string; reason?: string };
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (failure: RazorpayFailure) => void): void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

/* ------------------------------------------------------------- loading -- */

let loading: Promise<RazorpayConstructor> | null = null;

/**
 * Loads the checkout script once per page.
 *
 * The promise is cached rather than the boolean "have we started loading",
 * so two buttons pressed in quick succession wait on the same load instead of
 * racing to append two script tags.
 */
export function loadCheckout(): Promise<RazorpayConstructor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('The checkout can only be opened in a browser.'));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;

  loading = new Promise<RazorpayConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`);
    const script = existing ?? document.createElement('script');

    script.addEventListener('load', () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error('The payment window could not be loaded.'));
    });
    script.addEventListener('error', () => {
      // Let a later attempt try again rather than caching the failure.
      loading = null;
      reject(new Error('The payment window could not be loaded.'));
    });

    if (!existing) {
      script.src = CHECKOUT_SCRIPT;
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return loading;
}

/* ------------------------------------------------------------- opening -- */

/**
 * Opens the checkout and resolves with what became of it.
 *
 * Three endings, and they are kept apart on purpose. "I changed my mind" and
 * "my card was declined" are different things to be told, and recording the
 * first as the second would put a failure reason in front of the office for
 * something nobody got wrong.
 *
 * Nothing is prefilled. We hold the advertiser's name and telephone number,
 * but they were given to us to print in an advertisement, not to pass to a
 * third party for convenience — Razorpay asks for what it needs.
 */
export async function openCheckout(order: CheckoutOrder): Promise<CheckoutOutcome> {
  const Razorpay = await loadCheckout();

  return new Promise<CheckoutOutcome>((resolve) => {
    // Whichever of the three fires first wins; the others are then ignored,
    // because `ondismiss` also runs after a successful payment closes the
    // window and would otherwise overwrite the answer.
    let settled = false;
    const finish = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const checkout = new Razorpay({
      key: order.keyId,
      // Display only. The order was created server-side for this amount, and
      // that order is what Razorpay actually charges against.
      amount: order.amountPaise,
      currency: order.currency,
      order_id: order.orderId,
      name: 'Shree Classified',
      description: `${order.packageName} — ${order.adReference}`,
      handler: (response: RazorpayHandlerResponse) => {
        const orderId = response.razorpay_order_id;
        const paymentId = response.razorpay_payment_id;
        const signature = response.razorpay_signature;

        if (!orderId || !paymentId || !signature) {
          finish({
            kind: 'failed',
            orderId: order.orderId,
            reason: 'The payment window did not return a complete answer.',
          });
          return;
        }
        finish({ kind: 'paid', orderId, paymentId, signature });
      },
      modal: {
        ondismiss: () => finish({ kind: 'dismissed', orderId: order.orderId }),
      },
      retry: { enabled: false },
      theme: { color: '#1d4ed8' },
    });

    checkout.on('payment.failed', (failure) => {
      finish({
        kind: 'failed',
        orderId: order.orderId,
        reason:
          failure.error?.description ??
          failure.error?.reason ??
          'The payment did not go through.',
      });
    });

    checkout.open();
  });
}
