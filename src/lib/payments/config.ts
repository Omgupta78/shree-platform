import 'server-only';

/**
 * Razorpay credentials.
 *
 * Three values, all server-side. There is deliberately no `NEXT_PUBLIC_`
 * variable here, although the key id is not secret and the browser needs it to
 * open the checkout: the key id is returned with the order it belongs to, by
 * the endpoint that created that order. A key inlined into the bundle at build
 * time is a key that has to be redeployed to rotate, and one that can drift
 * out of step with the secret it is paired with — a test key in the browser
 * against a live secret on the server fails in a way nobody enjoys diagnosing.
 *
 * `server-only` makes importing this from a Client Component a build error, so
 * the secret cannot reach the browser by accident.
 *
 * Like Supabase, payments are optional. Without credentials the site still
 * builds and runs; packages simply show no price and the checkout never opens.
 * That is the same state the site is in today, and the state it stays in until
 * Shree Advertising supply their rates.
 */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  /** Absent until a webhook is configured in the Razorpay dashboard. */
  webhookSecret: string | null;
  /** Razorpay issues test keys as `rzp_test_…` and live keys as `rzp_live_…`. */
  isTestMode: boolean;
}

function read(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The configuration, or null when payments are not set up.
 *
 * Returns null rather than throwing so that a page can ask "can we take
 * money?" without a try/catch. The endpoints that must have it say so
 * themselves, with `requireRazorpayConfig()`.
 */
export function razorpayConfig(): RazorpayConfig | null {
  const keyId = read('RAZORPAY_KEY_ID');
  const keySecret = read('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) return null;

  return {
    keyId,
    keySecret,
    webhookSecret: read('RAZORPAY_WEBHOOK_SECRET'),
    isTestMode: keyId.startsWith('rzp_test_'),
  };
}

export function requireRazorpayConfig(): RazorpayConfig {
  const config = razorpayConfig();
  if (!config) {
    throw new Error(
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
    );
  }
  return config;
}

export function isPaymentsConfigured(): boolean {
  return razorpayConfig() !== null;
}

// The amount rules are pure and are needed in the browser too, so they live in
// `amounts.ts`, which carries no secrets and therefore no `server-only`.
export { isChargeable, MINIMUM_CHARGEABLE_PAISE } from '@/lib/payments/amounts';
