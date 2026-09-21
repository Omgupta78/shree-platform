'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { NotificationsMenu, type ChromeNotice } from '@/components/admin/notifications-menu';
import { CloseIcon, MenuIcon, SearchIcon } from '@/components/ui/icons';
import { ADMIN_NAV, type AdminNavItem } from '@/config/navigation';
import { cn } from '@/lib/utils';

/**
 * The admin chrome: sidebar, top bar, and the drawer they collapse into.
 *
 * Darker and denser than the public site, and that is a deliberate signal
 * rather than a decoration. Somebody working the queue has both open, and the
 * one thing they must never do is mistake a page that publishes for a page
 * that reads. The masthead is still Shree Classified; everything around it
 * says "office".
 *
 * A Client Component because it reads the pathname and owns the drawer. Who is
 * signed in, and what counts to show, are decided on the server and handed in
 * as props — the browser never receives a session here.
 */

export interface ChromeCounts {
  pending: number;
  open_reports: number;
  renewals_pending: number;
}

export function AdminChrome({
  children,
  staffName,
  staffRole,
  counts,
  notices,
}: {
  children: ReactNode;
  staffName: string;
  staffRole: 'admin' | 'moderator';
  counts: ChromeCounts | null;
  notices: ChromeNotice[];
}) {
  const pathname = usePathname();

  /*
   * The drawer remembers which page it was opened on, and is open only while
   * that is still the page. Navigating therefore closes it as a consequence of
   * the route changing, rather than by an effect that sets state after the
   * fact — which would render the drawer over the new page for one frame, and
   * is the cascading render the lint rule is about.
   */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const drawerOpen = openedOn !== null && openedOn === pathname;
  const setDrawerOpen = (open: boolean) => setOpenedOn(open ? pathname : null);

  useEffect(() => {
    if (!drawerOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenedOn(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh bg-surface-sunken lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-chrome-border bg-chrome text-chrome-fg lg:block">
        <SidebarContent staffRole={staffRole} counts={counts} pathname={pathname} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-sm hover:bg-surface-sunken lg:hidden"
            aria-expanded={drawerOpen}
          >
            <MenuIcon />
            <span className="sr-only">Open the admin menu</span>
          </button>

          <form action="/admin/advertisements" className="min-w-0 flex-1 sm:max-w-md">
            <label htmlFor="admin-search" className="sr-only">
              Search advertisements
            </label>
            <div className="relative">
              <SearchIcon
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle"
              />
              <input
                id="admin-search"
                name="q"
                type="search"
                placeholder="Reference, title, advertiser, phone…"
                className="h-9 w-full rounded-sm border border-line-strong bg-surface pr-3 pl-9 text-sm placeholder:text-fg-subtle"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-3">
            <NotificationsMenu notices={notices} />
            <Link
              href="/"
              className="hidden text-sm text-fg-muted underline-offset-4 hover:underline sm:inline"
            >
              View the site
            </Link>
            <span className="hidden text-right text-xs leading-tight sm:block">
              <span className="block font-medium">{staffName}</span>
              <span className="block text-fg-subtle capitalize">{staffRole}</span>
            </span>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="rounded-sm border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-sunken"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
          />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-chrome text-chrome-fg">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute top-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-sm hover:bg-white/10"
            >
              <CloseIcon />
              <span className="sr-only">Close the menu</span>
            </button>
            <SidebarContent staffRole={staffRole} counts={counts} pathname={pathname} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SidebarContent({
  staffRole,
  counts,
  pathname,
}: {
  staffRole: 'admin' | 'moderator';
  counts: ChromeCounts | null;
  pathname: string;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Link href="/admin" className="block border-b border-chrome-border px-5 py-4">
        <span className="block font-serif text-lg leading-none font-semibold">Shree</span>
        <span className="mt-1 block text-[0.625rem] leading-none font-semibold tracking-[0.22em] text-chrome-fg/60 uppercase">
          Classified Admin
        </span>
      </Link>

      <nav aria-label="Admin" className="flex-1 px-3 py-4">
        {ADMIN_NAV.map((group) => {
          const items = group.items.filter(
            (item) => !item.adminOnly || staffRole === 'admin',
          );
          if (!items.length) return null;

          return (
            <div key={group.heading} className="mb-5">
              <h2 className="px-2 pb-1.5 text-[0.625rem] font-semibold tracking-[0.16em] text-chrome-fg/45 uppercase">
                {group.heading}
              </h2>
              <ul>
                {items.map((item) => (
                  <li key={item.href}>
                    <SidebarRow item={item} counts={counts} pathname={pathname} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarRow({
  item,
  counts,
  pathname,
}: {
  item: AdminNavItem;
  counts: ChromeCounts | null;
  pathname: string;
}) {
  const badge = item.badge && counts ? counts[item.badge] : 0;

  if (!item.built) {
    // Dimmed and unclickable. A menu item that 404s teaches people that the
    // menu is unreliable, and then they stop trusting the ones that work.
    return (
      <span
        aria-disabled="true"
        title="Not built yet"
        className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm text-chrome-fg/35"
      >
        {item.label}
        <span className="text-[0.625rem] tracking-wider uppercase">soon</span>
      </span>
    );
  }

  // `/admin` would otherwise be "current" on every page beneath it.
  const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors',
        active ? 'bg-white/15 font-medium' : 'text-chrome-fg/75 hover:bg-white/10',
      )}
    >
      {item.label}
      {badge > 0 ? (
        <span className="min-w-5 rounded-full bg-primary-solid px-1.5 py-0.5 text-center text-[0.6875rem] leading-none font-semibold text-primary-fg tabular-nums">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  );
}
