'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { CATEGORIES, categoryHref } from '@/config/categories';
import { PRIMARY_NAV } from '@/config/navigation';
import { SITE } from '@/config/site';
import { CloseIcon, MenuIcon, PhoneIcon } from '@/components/ui/icons';
import { formatPhone, telHref } from '@/lib/format';

/**
 * Slide-over navigation for tablet and mobile.
 *
 * Closes on route change and on Escape, traps nothing but returns focus to the
 * trigger on close, and locks background scroll while open.
 */
export function MobileMenu({ account }: { account?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on navigation. Adjusting state during render rather than in an
  // effect avoids a second render pass and a visible flash.
  const [renderedPath, setRenderedPath] = useState(pathname);
  if (pathname !== renderedPath) {
    setRenderedPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      trigger?.focus();
    };
  }, [open]);

  const primaryPhone = SITE.phones[0];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-sm text-fg hover:bg-surface-sunken lg:hidden"
      >
        <MenuIcon />
        <span className="sr-only">Open menu</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
          />

          <div
            id="mobile-menu"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-[min(21rem,90vw)] flex-col overflow-y-auto bg-surface shadow-raised outline-none"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="font-serif text-lg font-semibold">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-sm hover:bg-surface-sunken"
              >
                <CloseIcon />
                <span className="sr-only">Close menu</span>
              </button>
            </div>

            <nav aria-label="Main" className="border-b border-line p-2">
              <ul>
                {PRIMARY_NAV.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={pathname === link.href ? 'page' : undefined}
                      className="block rounded-sm px-3 py-2.5 text-[0.9375rem] font-medium hover:bg-surface-sunken aria-[current=page]:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="border-b border-line p-4">
              <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-fg-subtle uppercase">
                Categories
              </p>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                {CATEGORIES.map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={categoryHref(category.slug)}
                      className="block rounded-sm py-1.5 text-sm text-fg-muted hover:text-primary"
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-auto space-y-2 p-4">
              {account}
              {primaryPhone ? (
                <a
                  href={telHref(primaryPhone)}
                  className="flex items-center justify-center gap-2 pt-2 text-sm font-medium text-fg-muted"
                >
                  <PhoneIcon size={15} />
                  {formatPhone(primaryPhone)}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
