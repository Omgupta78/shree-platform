import Link from 'next/link';

import { Container } from '@/components/ui/container';
import { MailIcon, MapPinIcon, PhoneIcon } from '@/components/ui/icons';
import { CATEGORIES, categoryHref } from '@/config/categories';
import { LEGAL_NAV, PRIMARY_NAV } from '@/config/navigation';
import { SITE } from '@/config/site';
import { formatPhone, telHref } from '@/lib/format';

export function Footer() {
  return (
    <footer className="mt-20 bg-chrome text-chrome-fg">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="font-serif text-2xl leading-none font-semibold tracking-tight">
              Shree
            </span>
            <span aria-hidden="true" className="h-6 w-px self-center bg-chrome-border" />
            <span className="text-[0.6875rem] leading-none font-semibold tracking-[0.2em] text-chrome-muted uppercase">
              Classified
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-chrome-muted">
            Local classified and display advertising for {SITE.city} and Haridwar district,
            in print and online.
          </p>
          <p className="mt-4 text-xs text-chrome-muted">Published by {SITE.publisher}</p>
        </div>

        <nav aria-labelledby="footer-links">
          <h2
            id="footer-links"
            className="text-xs font-semibold tracking-[0.14em] text-chrome-fg uppercase"
          >
            Quick links
          </h2>
          <ul className="mt-4 space-y-2.5">
            {PRIMARY_NAV.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-chrome-muted transition-colors hover:text-chrome-fg"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-categories">
          <h2
            id="footer-categories"
            className="text-xs font-semibold tracking-[0.14em] text-chrome-fg uppercase"
          >
            Categories
          </h2>
          <ul className="mt-4 space-y-2.5">
            {CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link
                  href={categoryHref(category.slug)}
                  className="text-sm text-chrome-muted transition-colors hover:text-chrome-fg"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-xs font-semibold tracking-[0.14em] text-chrome-fg uppercase">
            Contact
          </h2>
          <address className="mt-4 space-y-3 text-sm not-italic text-chrome-muted">
            <p className="flex gap-2.5">
              <MapPinIcon size={15} className="mt-0.5 shrink-0" />
              <span>{SITE.address}</span>
            </p>
            {SITE.phones.map((phone) => (
              <p key={phone} className="flex items-center gap-2.5">
                <PhoneIcon size={15} className="shrink-0" />
                <a href={telHref(phone)} className="transition-colors hover:text-chrome-fg">
                  {formatPhone(phone)}
                </a>
              </p>
            ))}
            <p className="flex items-center gap-2.5">
              <MailIcon size={15} className="shrink-0" />
              <a
                href={`mailto:${SITE.email}`}
                className="transition-colors hover:text-chrome-fg"
              >
                {SITE.email}
              </a>
            </p>
          </address>

          <h2 className="mt-8 text-xs font-semibold tracking-[0.14em] text-chrome-fg uppercase">
            Legal
          </h2>
          <ul className="mt-4 space-y-2.5">
            {LEGAL_NAV.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-chrome-muted transition-colors hover:text-chrome-fg"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>

      {/* The same notice that runs on the classified pages of the paper. */}
      <div className="border-t border-chrome-border">
        <Container className="py-6">
          <p className="text-xs leading-relaxed text-chrome-muted">{SITE.readerDisclaimer}</p>
          <p className="mt-4 text-xs text-chrome-muted">
            &copy; {new Date().getFullYear()} {SITE.publisher}, {SITE.city}. All rights reserved.
            &middot; {SITE.website}
          </p>
        </Container>
      </div>
    </footer>
  );
}
