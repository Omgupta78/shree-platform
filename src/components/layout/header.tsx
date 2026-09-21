'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { MobileMenu } from '@/components/layout/mobile-menu';
import { Container } from '@/components/ui/container';
import { MailIcon, PhoneIcon } from '@/components/ui/icons';
import { PRIMARY_NAV } from '@/config/navigation';
import { SITE } from '@/config/site';
import { formatPhone, telHref } from '@/lib/format';

/**
 * Site header.
 *
 * Three bands, echoing how the printed paper stacks its masthead: a thin
 * utility strip carrying the office contacts, the masthead row itself, and a
 * navigation rule. Below `lg` the navigation collapses into the slide-over
 * menu and the masthead row keeps only the wordmark and the menu button.
 *
 * The account controls arrive as slots rather than being built here: whether
 * somebody is signed in has to be decided on the server from a verified token,
 * and this component is a Client Component because it reads the pathname.
 */
export function Header({
  account,
  accountMenu,
}: {
  account?: ReactNode;
  accountMenu?: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <header className="border-b-2 border-fg bg-surface">
      {/* Utility strip */}
      <div className="hidden border-b border-line bg-surface-sunken sm:block">
        <Container className="flex h-9 items-center justify-between gap-4 text-xs">
          <p className="text-fg-muted">
            Published every <span className="font-semibold text-fg">{SITE.publishDay}</span>{' '}
            &middot; {SITE.city}, {SITE.state}
          </p>
          <div className="flex items-center gap-4">
            {SITE.phones.map((phone) => (
              <a
                key={phone}
                href={telHref(phone)}
                className="flex items-center gap-1.5 text-fg-muted transition-colors hover:text-primary"
              >
                <PhoneIcon size={13} />
                <span className="font-medium text-fg">{formatPhone(phone)}</span>
              </a>
            ))}
            <a
              href={`mailto:${SITE.email}`}
              className="hidden items-center gap-1.5 text-fg-muted transition-colors hover:text-primary lg:flex"
            >
              <MailIcon size={13} />
              {SITE.email}
            </a>
          </div>
        </Container>
      </div>

      {/* Masthead row */}
      <Container className="flex h-[4.5rem] items-center gap-6">
        <Link
          href="/"
          className="flex shrink-0 items-baseline gap-2.5 rounded-xs"
          aria-label={`${SITE.name} — home`}
        >
          <span className="font-serif text-2xl leading-none font-semibold tracking-tight sm:text-[1.75rem]">
            Shree
          </span>
          <span
            aria-hidden="true"
            className="h-6 w-px self-center bg-line-strong"
          />
          <span className="text-[0.6875rem] leading-none font-semibold tracking-[0.2em] text-primary uppercase sm:text-xs">
            Classified
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {account}
          <MobileMenu account={accountMenu} />
        </div>
      </Container>

      {/* Navigation rule */}
      <nav aria-label="Main" className="hidden border-t border-line lg:block">
        <Container>
          <ul className="-mx-3 flex items-center">
            {PRIMARY_NAV.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={`relative inline-flex h-12 items-center px-3 text-sm font-medium transition-colors ${
                      active
                        ? 'text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Container>
      </nav>
    </header>
  );
}
