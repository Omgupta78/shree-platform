import type { Metadata } from 'next';

import { SignInForm } from '@/components/auth/auth-forms';
import { SetupNotice } from '@/components/setup-notice';
import { safeRedirect } from '@/lib/auth/schema';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to manage the advertisements you have booked with Shree Classified.',
  // An account page has nothing to offer a search engine, and a sign-in form
  // in an index is only ever useful to somebody phishing with it.
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeRedirect(
    Array.isArray(params.next) ? params.next[0] : params.next,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Sign in</h1>
        <p className="mt-2 text-[0.9375rem] text-fg-muted">
          To post an advertisement, or to see the ones you have already booked.
        </p>
      </header>

      {/*
        The form is shown whether or not a database is connected, and the
        notice above it says which state this is. Hiding the form would change
        the shape of the page between environments and leave the action's own
        "not configured" answer with no way to be seen; the action is still
        what refuses.
      */}
      {isSupabaseConfigured ? null : <SetupNotice />}
      <SignInForm next={next} />
    </div>
  );
}
