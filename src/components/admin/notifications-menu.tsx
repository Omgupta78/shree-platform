'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { BellIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * The bell in the top bar.
 *
 * It lists what `buildNotices()` derived on the server from the same counts
 * the dashboard shows — no separate notifications table, no polling, no email.
 * The badge counts the notices that ask somebody to do something; the "queue
 * is clear" line is information, not a notification, so it does not light it.
 */
export interface ChromeNotice {
  id: string;
  tone: 'urgent' | 'attention' | 'calm';
  message: string;
  href: string;
}

export function NotificationsMenu({ notices }: { notices: ChromeNotice[] }) {
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn !== null && openedOn === pathname;
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const actionable = notices.filter((notice) => notice.tone !== 'calm').length;

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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpenedOn(open ? null : pathname)}
        aria-expanded={open}
        aria-controls={panelId}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-sm hover:bg-surface-sunken"
      >
        <BellIcon size={18} />
        <span className="sr-only">
          Notifications{actionable ? ` (${actionable} need attention)` : ''}
        </span>
        {actionable ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[0.625rem] leading-4 font-semibold text-white"
          >
            {actionable}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-line bg-surface p-1 shadow-lg"
        >
          <p className="px-3 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-fg-subtle uppercase">
            Notifications
          </p>
          <ul>
            {notices.map((notice) => (
              <li key={notice.id}>
                <Link
                  href={notice.href}
                  className="flex items-start gap-2 rounded-sm px-3 py-2 text-sm hover:bg-surface-sunken"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      notice.tone === 'urgent' && 'bg-danger-600',
                      notice.tone === 'attention' && 'bg-gold-400',
                      notice.tone === 'calm' && 'bg-line-strong',
                    )}
                  />
                  <span>{notice.message}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
