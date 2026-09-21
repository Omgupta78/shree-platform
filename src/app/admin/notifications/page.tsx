import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminEmpty, AdminPageHeader, AdminPanel } from '@/components/admin/admin-ui';
import { MarkAllRead } from '@/components/notifications/mark-all-read';
import { Badge } from '@/components/ui/badge';
import { getNotifications } from '@/lib/data/notifications';
import { formatDate, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Notifications' };

/**
 * The office's own notifications.
 *
 * The same table and the same view as an advertiser's, because a staff member
 * is a user with a role: `my_notifications` filters on `auth.uid()` and
 * returns each person's own. That is why a moderator does not see an
 * advertiser's notifications here — those are addressed to somebody else, and
 * what the office has a right to read is the audit trail, which is the record
 * of what was DONE rather than who was told.
 *
 * The bell in the top bar is a different thing and stays as it was: it derives
 * what is waiting from the dashboard counts, which is a live answer to "what
 * needs doing". This page is the history of what arrived.
 */
export default async function AdminNotificationsPage() {
  const notifications = await getNotifications();
  const unread = notifications.filter((item) => !item.is_read).length;

  return (
    <>
      <AdminPageHeader
        title="Notifications"
        description="What has arrived for you: new advertisements, renewals, payments and reports."
        count={notifications.length}
      />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        {unread > 0 ? <MarkAllRead /> : null}
        <Link
          href="/admin/notifications/templates"
          className="text-sm font-medium text-primary hover:underline"
        >
          Message templates
        </Link>
      </div>

      <AdminPanel>
        {notifications.length === 0 ? (
          <AdminEmpty
            title="Nothing yet"
            description="New advertisements, renewals, payments and reports will appear here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {notifications.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href ?? '/admin'}
                  data-notification={item.id}
                  data-unread={item.is_read ? undefined : 'true'}
                  className={cn(
                    'flex gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken',
                    !item.is_read && 'bg-primary-surface/30',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                      item.is_read ? 'bg-line-strong' : 'bg-primary',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className={cn('text-sm', !item.is_read && 'font-semibold')}>
                        {item.title}
                        {item.is_read ? null : <span className="sr-only"> (unread)</span>}
                      </span>
                      <span
                        className="text-xs whitespace-nowrap text-fg-subtle"
                        title={formatDate(item.created_at)}
                      >
                        {formatRelative(item.created_at)}
                      </span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-fg-muted">{item.body}</span>
                      {item.entity_type ? (
                        <Badge tone="neutral">{item.entity_type}</Badge>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
    </>
  );
}
