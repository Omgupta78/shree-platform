import type { Metadata, Viewport } from 'next';

import { AccountActions } from '@/components/auth/account-actions';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { SITE } from '@/config/site';
import { getOfficeDetails } from '@/lib/data/settings';
import { siteUrl } from '@/lib/env';
import { fontVariables } from '@/lib/fonts';
import { JsonLd, organisationSchema, websiteSchema } from '@/lib/seo/jsonld';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE.name} | Local Classified & Advertising Platform in ${SITE.city}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  robots: { index: true, follow: true },
  formatDetection: { telephone: true, address: false, email: false },
  /*
   * The share card and its Twitter/X equivalent, for any page that does not
   * build its own through `publicMetadata`. Without this a page inheriting
   * only the defaults would share as a bare link.
   *
   * No `twitter.site` or `twitter.creator`: this business has no X account
   * recorded anywhere in the project, and an invented @name points at
   * somebody else.
   */
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    locale: 'en_IN',
    url: siteUrl(),
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0b0b' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * Who publishes this site, and that the site has a working search, stated
   * once for every page rather than repeated per route. The office's details
   * come from `app_settings` where they have been set, so a changed telephone
   * number changes the structured data too — it is the same source the footer
   * and the contact page read.
   */
  const office = await getOfficeDetails();

  return (
    <html lang="en-IN" className={fontVariables} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only-focusable absolute top-2 left-2 z-[100] rounded-sm bg-primary-solid px-4 py-2 text-sm font-medium text-primary-fg"
        >
          Skip to main content
        </a>
        <Header account={<AccountActions />} accountMenu={<AccountActions variant="menu" />} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />

        <JsonLd data={organisationSchema(office)} />
        <JsonLd data={websiteSchema()} />
      </body>
    </html>
  );
}
