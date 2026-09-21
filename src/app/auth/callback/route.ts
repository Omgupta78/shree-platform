import { NextResponse, type NextRequest } from 'next/server';

import { safeRedirect } from '@/lib/auth/schema';
import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Where every emailed link lands: account confirmation, a magic link, and the
 * password-reset link.
 *
 * Supabase sends a one-time `code`, which is exchanged here for a session and
 * set as cookies. A Route Handler rather than a page because this is the one
 * place a redirect has to be a real HTTP response, and because a Server
 * Component cannot set a cookie.
 *
 * `next` is put through `safeRedirect`, so a tampered link cannot use a
 * confirmed sign-in to bounce somebody to another site.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeRedirect(url.searchParams.get('next'), '/my-ads');

  if (!isSupabaseConfigured || !code) {
    return NextResponse.redirect(new URL('/sign-in?error=link', url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // An expired or already-used link. Say so on the sign-in page rather than
    // leaving somebody on a blank screen wondering whether it worked.
    return NextResponse.redirect(new URL('/sign-in?error=expired', url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
