import type { Metadata } from 'next';
import Link from 'next/link';

import { OwnerGate } from '@/components/my-ads/owner-gate';
import { MarkAllRead } from '@/components/notifications/mark-all-read';
import { Container } from '@/components/ui/container';
import { EmptyState } from '@/components/ui/states';
import { getNotifications } from '@/lib/data/notifications';
import { formatDate, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
};

/**
 * Everything the advertiser has been told.
 *
 * Read from `my_notifications`, whose WHERE clause is `user_id = auth.uid()`,
 * so this page contains no ownership check and cannot forget one.
 *
 * Unread rows are marked three ways rather than one — a filled dot, a heavier
 * title and a tinted row — because a single colour difference is what somebody
 * with low vision or a bright screen misses.
 */
export default async function NotificationsPage() {
  return (
    <OwnerGate next="/my-ads/notifications">
      <Notifications />
    </OwnerGate>
  );
}

async function Notifications() {
  const notifications = await getNotifications();
  const unread = notifications.filter((item) => !item.is_read).length;

  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm">
          <Link href="/my-ads" className="text-fg-muted hover:text-primary">
            ← My advertisements
          </Link>
        </p>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold">Notifications</h1>
            <p className="mt-2 text-[0.9375rem] text-fg-muted">
              {unread > 0
                ? `${unread} unread.`
                : 'Everything about your advertisements, as it happens.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {unread > 0 ? <MarkAllRead /> : null}
            <Link
              href="/my-ads/settings/notifications"
              className="text-sm font-medium text-primary hover:underline"
            >
              Settings
            </Link>
          </div>
        </div>

        <div className="mt-8">
          {notifications.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              description="When something happens to one of your advertisements, you will find it here."
              action={{ href: '/my-ads', label: 'Back to my advertisements' }}
            />
          ) : (
            <ul className="space-y-2">
              {notifications.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href ?? '/my-ads'}
                    data-notification={item.id}
                    data-unread={item.is_read ? undefined : 'true'}
                    className={cn(
                      'flex gap-3 rounded-md border p-4 transition-colors',
                      item.is_read
                        ? 'border-line bg-surface hover:border-line-strong'
                        : 'border-primary/40 bg-primary-surface/40 hover:border-primary',
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
                        <span className={cn('text-[0.9375rem]', !item.is_read && 'font-semibold')}>
                          {item.title}
                          {item.is_read ? null : (
                            <span className="sr-only"> (unread)</span>
                          )}
                        </span>
                        <span
                          className="text-xs whitespace-nowrap text-fg-subtle"
                          title={formatDate(item.created_at)}
                        >
                          {formatRelative(item.created_at)}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-fg-muted">
                        {item.body}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Container>
  );
}
