'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { markAllNotificationsReadAction } from '@/app/my-ads/notification-actions';

/**
 * Marks everything read.
 *
 * A button, not a link: it changes something. The action takes no user id —
 * `mark_all_notifications_read()` reads `auth.uid()` in the database and
 * updates that advertiser's rows and no others, which is asserted in
 * `supabase/test/notification_checks.sql` rather than left as an intention.
 */
export function MarkAllRead() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      data-mark-all-read
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllNotificationsReadAction();
          router.refresh();
        })
      }
      className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
    >
      {pending ? 'Marking…' : 'Mark all read'}
    </button>
  );
}
