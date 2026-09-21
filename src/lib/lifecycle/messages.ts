/**
 * Turning a refusal from the database into a sentence.
 *
 * The lifecycle functions raise with messages written for people — "A renewal
 * is already waiting for review", "The new expiry date must be later than the
 * current one". Those are passed through. Anything else (a constraint name, a
 * connection error) is not: an internal error is not an explanation, and it
 * can describe the schema to whoever triggered it.
 */
const KNOWN = [
  /already waiting for review/i,
  /not due for renewal yet/i,
  /Only a live or expired advertisement can be renewed/i,
  /That package is not available/i,
  /This account cannot renew/i,
  /has already been decided/i,
  /No such (advertisement|renewal)/i,
  /cannot be renewed/i,
  /A reason is required/i,
  /Only an administrator/i,
  /Only Shree Classified staff/i,
  /Only a live advertisement can be extended/i,
  /must be later than the current one/i,
  /must be within \d+ days of today/i,
  /cannot go from/i,
  /Please sign in/i,
];

const FRIENDLIER: Array<[RegExp, string]> = [
  [/No such advertisement/i, 'We could not find that advertisement on your account.'],
  [/cannot go from expired to approved/i, 'An expired advertisement has to be renewed and reviewed first.'],
];

export function renewalMessageFor(error: { message?: string } | null): string {
  const raw = error?.message ?? '';
  for (const [pattern, sentence] of FRIENDLIER) if (pattern.test(raw)) return sentence;
  if (KNOWN.some((pattern) => pattern.test(raw))) {
    const sentence = raw.replace(/\s+/g, ' ').trim();
    return sentence.endsWith('.') ? sentence : `${sentence}.`;
  }
  return 'That could not be saved just now. Please try again in a moment.';
}
