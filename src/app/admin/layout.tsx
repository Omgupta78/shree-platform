import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AdminChrome } from '@/components/admin/admin-chrome';
import { SetupNotice } from '@/components/setup-notice';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { buildNotices, getDashboardCounts } from '@/lib/admin/dashboard';
import { SITE } from '@/config/site';
import { getStaffMember } from '@/lib/admin/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Shree Classified Admin' },
  robots: { index: false, follow: false },
};

/**
 * Nothing under /admin is ever cached or prerendered. Every page here depends
 * on who is asking and on the state of the queue a second ago.
 */
export const dynamic = 'force-dynamic';

/**
 * The office.
 *
 * `src/proxy.ts` has already turned away anyone who is not staff, with a real
 * HTTP redirect, before this renders. The check below is the second of the
 * three described in `lib/admin/guard.ts`: it is what covers an admin route
 * that gets added to the application and forgotten in the proxy's matcher.
 *
 * It renders a refusal rather than redirecting because Next.js 16.3.5 swallows
 * `redirect()` called from a Server Component — a page that "redirected" that
 * way would answer 200 and render its contents to the very person it was
 * trying to turn away.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured) {
    return (
      <Container className="py-10">
        <SetupNotice />
      </Container>
    );
  }

  const user = await getCurrentUser();
  if (!user) return <Refusal signedIn={false} />;

  const staff = await getStaffMember();
  if (!staff) return <Refusal signedIn />;

  // Null when the count fails; the sidebar simply shows no badges rather than
  // inventing a zero.
  const counts = await getDashboardCounts();

  return (
    <AdminChrome
      staffName={staff.name}
      staffRole={staff.role}
      counts={
        counts
          ? {
              pending: counts.pending,
              open_reports: counts.open_reports,
              renewals_pending: counts.renewals_pending,
            }
          : null
      }
      notices={counts ? buildNotices(counts) : []}
    >
      {children}
    </AdminChrome>
  );
}

function Refusal({ signedIn }: { signedIn: boolean }) {
  return (
    <Container className="py-20">
      <div className="mx-auto max-w-md rounded-md border border-line bg-surface p-8 text-center">
        <h1 className="font-serif text-2xl font-semibold">Not your area</h1>
        <p className="mt-2 text-[0.9375rem] text-fg-muted">
          {signedIn
            ? 'This part of the site is for Shree Classified staff. Your own advertisements are on your account page.'
            : 'Please sign in with a Shree Classified staff account.'}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {signedIn ? (
            <Button href="/my-ads">My advertisements</Button>
          ) : (
            <Button href={`/sign-in?next=${encodeURIComponent('/admin')}`}>Sign in</Button>
          )}
          <Button href="/" variant="secondary">
            Back to the site
          </Button>
        </div>
        <p className="mt-6 text-xs text-fg-subtle">
          If you should have access,{' '}
          <a
            href={`tel:+91${SITE.phones[0]}`}
            className="underline underline-offset-2"
          >
            ask the office on {SITE.phones[0]}
          </a>{' '}
          to grant it.
        </p>
      </div>
    </Container>
  );
}
