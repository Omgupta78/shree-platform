import 'server-only';

import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ProfileRow } from '@/types/database';

/**
 * Who is asking.
 *
 * `getUser()` rather than `getSession()`: a session read from a cookie is
 * whatever the cookie says, while `getUser()` verifies the token with the auth
 * server. Everything that decides anything — a server action, a protected page
 * — goes through here, so nothing in the application ever trusts a cookie's
 * word for who the caller is.
 *
 * `cache` deduplicates the call across one render pass, so a layout, a page
 * and three components asking the same question cost one round trip.
 */

export interface SignedInUser {
  id: string;
  email: string | null;
}

export const getCurrentUser = cache(async (): Promise<SignedInUser | null> => {
  if (!isSupabaseConfigured) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email ?? null };
});

export const getCurrentProfile = cache(async (): Promise<ProfileRow | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) return null;
  return data;
});

/** True for a moderator or an administrator who is not blocked. */
export async function isStaff(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return Boolean(profile && !profile.is_blocked && profile.role !== 'user');
}

/**
 * The user, or an explanation of why there is not one.
 *
 * Deliberately not a redirect. Next.js 16.3.5 swallows `redirect()` called
 * from a Server Component — a probe containing nothing but a redirect answers
 * 200 with no Location header — so a page that "protected" itself that way
 * would render its contents to a signed-out visitor. Redirecting is `proxy.ts`
 * 's job, where it is a real HTTP response; a page's job is to render the
 * sign-in panel when this returns null, which is the second line of defence if
 * the matcher in the proxy is ever narrowed by mistake.
 */
export async function getUserOrNull(): Promise<SignedInUser | null> {
  return getCurrentUser();
}

export class NotSignedInError extends Error {
  constructor() {
    super('Please sign in to continue.');
    this.name = 'NotSignedInError';
  }
}

/**
 * The user, or a thrown error. For server actions, where there is no page to
 * render a panel and the right answer is to refuse.
 */
export async function requireUser(): Promise<SignedInUser> {
  const user = await getCurrentUser();
  if (!user) throw new NotSignedInError();
  return user;
}
