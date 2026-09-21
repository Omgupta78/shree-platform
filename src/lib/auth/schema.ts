import { z } from 'zod';

import { clean, normalisePhone } from '@/lib/post-ad/schema';

/**
 * Account forms.
 *
 * Shared by the browser and the server action, exactly as the submission
 * schema is: the form imports it to show a message early, the action imports
 * it to decide. Nothing here is a gate until the server runs it.
 *
 * The phone helpers come from the advertisement schema rather than being
 * written again, so "what counts as a phone number" has one answer across the
 * site.
 */

export const MIN_PASSWORD = 10;

/**
 * Length, and nothing else.
 *
 * A composition rule ("one capital, one digit, one symbol") pushes people
 * towards Password1! and towards writing it down. Length is the property that
 * actually costs an attacker something, and Supabase checks the password
 * against known breaches on top of this.
 */
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD, `Please use at least ${MIN_PASSWORD} characters.`)
  .max(72, 'Please keep the password to 72 characters or fewer.');

export const emailSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.email('Please enter a valid email address.'));

export const signInSchema = z.object({
  email: emailSchema,
  // Deliberately not `passwordSchema`: an existing account may predate the
  // current minimum, and telling someone their password is "too short" at the
  // sign-in screen is both unhelpful and a hint about what is stored.
  password: z.string().min(1, 'Please enter your password.'),
});

export const signUpSchema = z.object({
  fullName: z
    .string()
    .transform(clean)
    .pipe(
      z
        .string()
        .min(2, 'Please enter your full name.')
        .max(80, 'Please keep the name to 80 characters or fewer.'),
    ),
  email: emailSchema,
  phone: z
    .string()
    .transform(normalisePhone)
    .pipe(
      z.union([
        z.literal(''),
        z.string().regex(/^[6-9]\d{9}$/, 'Please enter a 10-digit Indian mobile number.'),
      ]),
    ),
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The two passwords do not match.',
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/** What every account action returns to its form. */
export interface AuthFormState {
  status: 'idle' | 'error' | 'done';
  /** One message for the form as a whole. */
  message?: string;
  /** Field name to message, for the inline errors. */
  fieldErrors?: Record<string, string>;
  /** Where the form should send the browser once it has succeeded. */
  redirectTo?: string;
}

export const IDLE: AuthFormState = { status: 'idle' };

/**
 * A safe place to land after signing in.
 *
 * Only a path on this site is accepted. `//evil.example` and
 * `https://evil.example` are both valid values for a `next` parameter and both
 * navigate away, which is how an open redirect turns a sign-in page into a
 * convincing phishing hop.
 */
export function safeRedirect(value: string | null | undefined, fallback = '/my-ads'): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
