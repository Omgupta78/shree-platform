'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/my-ads/notification-actions';
import { BellIcon } from '@/components/ui/icons';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MyNotificationRow } from '@/types/database';

/**
 * The advertiser's bell.
 *
 * The list and the unread count are rendered on the server and handed down as
 * props; this component opens a panel and sends two actions. There is no
 * polling and no subscription, which is a decision rather than an omission:
 * every page of this site is server-rendered per request and the header is on
 * all of them, so the count is already refreshed on each navigation. A poll
 * would add a request every few seconds to tell somebody something they will
 * see the moment they click anything.
 *
 * `router.refresh()` after marking read re-renders the server components, so
 * the badge and the list agree without either being duplicated in client
 * state.
 */
export function NotificationBell({
  notifications,
  unread,
}: {
  notifications: MyNotificationRow[];
  unread: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = openedOn !== null && openedOn === pathname;
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  // Closing on a click outside and on Escape, the same way the office's bell
  // does — two bells that behave differently is two things to learn.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenedOn(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenedOn(null);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function markOne(id: string) {
    startTransition(async () => {
      await markNotificationReadAction(id);
      router.refresh();
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpenedOn(open ? null : pathname)}
        aria-expanded={open}
        aria-controls={panelId}
        data-notification-bell
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-sm hover:bg-surface-sunken"
      >
        <BellIcon size={18} />
        <span className="sr-only">
          Notifications{unread ? ` (${unread} unread)` : ''}
        </span>
        {unread ? (
          <span
            aria-hidden="true"
            data-unread-count
            className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[0.625rem] leading-4 font-semibold text-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-line bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-fg-subtle uppercase">
              Notifications
            </p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                disabled={pending}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-fg-muted">Nothing yet.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notifications.map((item) => (
                <li key={item.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={item.href ?? '/my-ads/notifications'}
                    onClick={() => {
                      if (!item.is_read) markOne(item.id);
                      setOpenedOn(null);
                    }}
                    className={cn(
                      'flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-sunken',
                      !item.is_read && 'bg-primary-surface/40',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        item.is_read ? 'bg-line-strong' : 'bg-primary',
                      )}
                    />
                    <span className="min-w-0">
                      <span className={cn('block text-sm', !item.is_read && 'font-semibold')}>
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                        {item.body}
                      </span>
                      <span className="mt-1 block text-[0.6875rem] text-fg-subtle">
                        {formatRelative(item.created_at)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-line px-3 py-2">
            <Link
              href="/my-ads/notifications"
              onClick={() => setOpenedOn(null)}
              className="text-sm font-medium text-primary hover:underline"
            >
              See all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
