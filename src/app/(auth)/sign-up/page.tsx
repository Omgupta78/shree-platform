import type { Metadata } from 'next';

import { SignUpForm } from '@/components/auth/auth-forms';
import { SetupNotice } from '@/components/setup-notice';
import { safeRedirect } from '@/lib/auth/schema';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Create a Shree Classified account to book and manage advertisements.',
  robots: { index: false, follow: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeRedirect(Array.isArray(params.next) ? params.next[0] : params.next);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Create an account</h1>
        <p className="mt-2 text-[0.9375rem] text-fg-muted">
          An account keeps your advertisements together so you can see what is running, what is
          waiting for review and what has finished.
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
      <SignUpForm next={next} />
    </div>
  );
}
