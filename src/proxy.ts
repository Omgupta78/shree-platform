import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { isProtectedPath, isStaffPath } from '@/config/navigation';
import { isSupabaseConfigured, supabaseCredentials } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Session refresh, and route protection.
 *
 * Named `proxy` and living in `src/proxy.ts`: Next.js 16 renamed the
 * middleware file convention.
 *
 * Route protection is HERE rather than in the pages themselves, and that is
 * not a preference. In Next.js 16.3.5 both `redirect()` and `notFound()` are
 * swallowed when called from a Server Component — a probe route containing
 * nothing but a redirect answers HTTP 200 with no Location header, so a page
 * that guarded itself that way would quietly render its contents to a
 * signed-out visitor. A proxy response is a real redirect, sent before any
 * page renders.
 *
 * The pages still render a `SignInRequired` panel when there is no session, as
 * a second line of defence: if the matcher below is ever narrowed and a route
 * slips out of it, the page shows the panel instead of somebody's
 * advertisements.
 */
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * The payment provider's webhook carries no session and authenticates
   * itself, by signature, against a secret this request has no use for.
   * Sending it through `getUser()` would add a token verification round-trip
   * to every delivery — and Razorpay retries a webhook it did not get a
   * prompt answer for, so the round-trip would be paid for twice.
   */
  if (pathname === '/api/payments/webhook') {
    return NextResponse.next();
  }

  if (!isSupabaseConfigured) {
    // Without a database there are no accounts, so a protected page has
    // nothing to protect. It renders its own "not connected" notice.
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const { url, anonKey } = supabaseCredentials();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser` rather than `getSession`: this verifies the token with the auth
  // server instead of believing the cookie. It is also what refreshes an
  // expiring session, which is why it runs on every request and not only on
  // the protected ones.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(pathname)) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = '/sign-in';
    signIn.search = '';
    // Come back to where they were trying to go. `safeRedirect` on the other
    // side only accepts a path on this site.
    signIn.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(signIn);
  }

  /*
   * The office.
   *
   * A signed-in advertiser who types `/admin` is sent back to their own page,
   * not to a sign-in form: they are signed in, and asking them to sign in
   * again would be a lie about what went wrong.
   *
   * The role is read here, from the database, once per admin request. Putting
   * it in the token instead would be faster and would also mean a demoted
   * administrator keeps their access until their token expires. It is also
   * only the first of three checks — the admin layout asks again, and the
   * database refuses regardless. See `lib/admin/guard.ts`.
   */
  if (user && isStaffPath(pathname)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_blocked')
      .eq('id', user.id)
      .maybeSingle();

    const staff =
      profile && !profile.is_blocked && (profile.role === 'admin' || profile.role === 'moderator');

    if (!staff) {
      const home = request.nextUrl.clone();
      home.pathname = '/my-ads';
      home.search = '';
      home.searchParams.set('error', 'not-staff');
      return NextResponse.redirect(home);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, image optimisation output and common
     * static file extensions.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
