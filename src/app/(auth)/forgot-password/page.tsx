import type { Metadata } from 'next';

import { ForgotPasswordForm } from '@/components/auth/auth-forms';
import { SetupNotice } from '@/components/setup-notice';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Forgotten password',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Forgotten your password?</h1>
        <p className="mt-2 text-[0.9375rem] text-fg-muted">
          Give us the email address on the account and we will send a link to set a new password.
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
      <ForgotPasswordForm />
    </div>
  );
}
