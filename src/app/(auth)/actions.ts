'use server';

import { revalidatePath } from 'next/cache';

import { isSupabaseConfigured, siteUrl } from '@/lib/env';
import {
  forgotPasswordSchema,
  safeRedirect,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
  type AuthFormState,
} from '@/lib/auth/schema';
import { collectErrors } from '@/lib/post-ad/schema';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The account actions.
 *
 * Each one re-validates with the same schema the form used, so the browser and
 * the server cannot disagree about what a valid email address is. Each returns
 * a state rather than redirecting: `redirect()` from a Server Component is
 * swallowed in this version of Next.js, and rather than keep two mental models
 * of where a redirect works, every form navigates from the client once the
 * action has said it may.
 */

const NOT_CONFIGURED: AuthFormState = {
  status: 'error',
  message:
    'Accounts are not available yet — the site is running without a database connection.',
};

/**
 * What we say when sign-in fails.
 *
 * One message for a wrong password and for an address that has no account.
 * Distinguishing them turns the sign-in form into a way of asking whether a
 * given person has registered.
 */
const SIGN_IN_FAILED = 'That email address and password do not match an account.';

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const parsed = signInSchema.safeParse({
    email: formData.get('email') ?? '',
    password: formData.get('password') ?? '',
  });
  if (!parsed.success) {
    return { status: 'error', fieldErrors: collectErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { status: 'error', message: SIGN_IN_FAILED };

  revalidatePath('/', 'layout');
  return {
    status: 'done',
    redirectTo: safeRedirect(formData.get('next')?.toString()),
  };
}

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName') ?? '',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
    password: formData.get('password') ?? '',
  });
  if (!parsed.success) {
    return { status: 'error', fieldErrors: collectErrors(parsed.error) };
  }

  const { email, password, fullName, phone } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the `handle_new_user` trigger, which creates the profile row.
      // The name and number are the advertiser's own, given for the office to
      // reach them by; nothing here is published.
      data: { full_name: fullName, phone: phone || null },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent('/my-ads')}`,
    },
  });

  if (error) {
    // Supabase reports a weak or breached password by message rather than by
    // code; passing it through is more use than "something went wrong".
    return { status: 'error', message: error.message };
  }

  // With email confirmation switched on there is no session yet, and saying so
  // is the whole of the next step.
  if (!data.session) {
    return {
      status: 'done',
      message: `Check ${email} for a link to confirm your account. You can close this page.`,
    };
  }

  revalidatePath('/', 'layout');
  return { status: 'done', redirectTo: safeRedirect(formData.get('next')?.toString()) };
}

export async function forgotPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') ?? '' });
  if (!parsed.success) {
    return { status: 'error', fieldErrors: collectErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent('/update-password')}`,
  });

  // The same answer whether or not the address has an account, for the same
  // reason the sign-in message is vague.
  return {
    status: 'done',
    message:
      'If that address has an account, a link to set a new password is on its way. The link is good for one hour.',
  };
}

export async function updatePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const parsed = updatePasswordSchema.safeParse({
    password: formData.get('password') ?? '',
    confirmPassword: formData.get('confirmPassword') ?? '',
  });
  if (!parsed.success) {
    return { status: 'error', fieldErrors: collectErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();

  // The recovery link put a session in place; without one there is nothing to
  // update, and updateUser would otherwise fail with a less useful message.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return {
      status: 'error',
      message: 'That link has expired. Please ask for a new one.',
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: 'error', message: error.message };

  revalidatePath('/', 'layout');
  return { status: 'done', redirectTo: '/my-ads', message: 'Your password has been changed.' };
}

export async function signOutAction(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
}
