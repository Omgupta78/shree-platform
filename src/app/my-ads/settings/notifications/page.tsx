import type { Metadata } from 'next';
import Link from 'next/link';

import { OwnerGate } from '@/components/my-ads/owner-gate';
import { NotificationPreferencesForm } from '@/components/notifications/preferences-form';
import { Container } from '@/components/ui/container';
import { getNotificationPreferences } from '@/lib/data/notifications';
import { isEmailConfigured, isWhatsAppConfigured } from '@/lib/notifications/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Notification settings',
  robots: { index: false, follow: false },
};

/**
 * Which channels an advertiser hears on.
 *
 * The form sends no user id. Whose preferences are saved is decided on the
 * server from a verified token, and the row-level policy checks it again on
 * both sides of the write — so a request naming somebody else writes nothing.
 */
export default async function NotificationSettingsPage() {
  return (
    <OwnerGate next="/my-ads/settings/notifications">
      <Settings />
    </OwnerGate>
  );
}

async function Settings() {
  const preferences = await getNotificationPreferences();
  const email = isEmailConfigured();
  const whatsapp = isWhatsAppConfigured();

  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm">
          <Link href="/my-ads/notifications" className="text-fg-muted hover:text-primary">
            ← Notifications
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Notification settings</h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-muted">
          These are messages about advertisements you have booked with us — not a newsletter, and
          we do not send one. Whatever you choose here, everything still appears in your{' '}
          <Link href="/my-ads/notifications" className="font-medium text-primary hover:underline">
            notifications
          </Link>
          .
        </p>

        {/*
          Said plainly rather than hidden. A switch that silently does nothing
          because the office has not connected a provider is worse than a
          switch that says so: the advertiser's choice is remembered either
          way, and applies the day it is connected.
        */}
        {!email || !whatsapp ? (
          <p className="mt-6 rounded-sm border border-accent-line bg-accent-surface p-3 text-sm leading-relaxed text-accent-fg">
            {!email && !whatsapp
              ? 'Email and WhatsApp are not connected yet. Your choices are saved and will apply once they are.'
              : !email
                ? 'Email is not connected yet. Your choice is saved and will apply once it is.'
                : 'WhatsApp is not connected yet. Your choice is saved and will apply once it is.'}
          </p>
        ) : null}

        <div className="mt-8">
          <NotificationPreferencesForm preferences={preferences} whatsAppAvailable={whatsapp} />
        </div>
      </div>
    </Container>
  );
}
