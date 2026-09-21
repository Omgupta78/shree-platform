/**
 * Turning what we store into what a provider wants.
 *
 * Pure, and free of `server-only`, so it can be exercised directly by the test
 * runner. Telephone numbers are stored as the ten digits somebody would dial
 * locally — which is how they are printed in the paper and how the contact
 * form asks for them — and WhatsApp wants them with the country code and no
 * punctuation.
 */

/** Digits only, with India's country code, or null if it is not a number we can use. */
export function normaliseIndianNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return null;
}
