import type { Metadata } from 'next';

import { UpdatePasswordForm } from '@/components/auth/auth-forms';
import { SetupNotice } from '@/components/setup-notice';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false, follow: false },
};

/**
 * Reached from the link in a password-reset email, which lands on
 * `/auth/callback` first — that route exchanges the code for a session and
 * sends the browser here. Without that session the action refuses and says the
 * link has expired.
 */
export default function UpdatePasswordPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Set a new password</h1>
        <p className="mt-2 text-[0.9375rem] text-fg-muted">
          Choose something you will remember. You will stay signed in on this device.
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
      <UpdatePasswordForm />
    </div>
  );
}
