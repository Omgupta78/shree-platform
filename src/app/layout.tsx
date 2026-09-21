import type { Metadata, Viewport } from 'next';

import { AccountActions } from '@/components/auth/account-actions';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { SITE } from '@/config/site';
import { siteUrl } from '@/lib/env';
import { fontVariables } from '@/lib/fonts';

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
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0b0b' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
      </body>
    </html>
  );
}
