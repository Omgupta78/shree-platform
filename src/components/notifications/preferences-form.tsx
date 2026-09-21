'use client';

import { useState } from 'react';

import { saveNotificationPreferencesAction } from '@/app/my-ads/notification-actions';
import { Button } from '@/components/ui/button';
import type { NotificationPreferences } from '@/lib/data/notifications';

/**
 * Which channels an advertiser wants to hear on.
 *
 * Three groups rather than sixteen switches. Sixteen is a settings page nobody
 * finishes reading; "what happened to my advertisement", "what happened to my
 * money" and "remind me before it ends" is what somebody actually has an
 * opinion about.
 *
 * There is no in-app column, and its absence is the point: the notification
 * centre is the record of what the office did to your advertisement. A
 * customer who has turned every channel off must still be able to find out why
 * theirs was refused.
 */

const GROUPS = [
  {
    key: 'advertisement',
    title: 'Your advertisements',
    description: 'Received, approved, sent back for a change, or not accepted.',
    email: 'email_advertisement_updates',
    whatsapp: 'whatsapp_advertisement_updates',
  },
  {
    key: 'payment',
    title: 'Payments',
    description: 'Payment received, failed, or cancelled.',
    email: 'email_payment_updates',
    whatsapp: 'whatsapp_payment_updates',
  },
  {
    key: 'expiry',
    title: 'Expiry reminders',
    description: 'A note before a run ends, and when it has.',
    email: 'email_expiry_reminders',
    whatsapp: 'whatsapp_expiry_reminders',
  },
] as const satisfies ReadonlyArray<{
  key: string;
  title: string;
  description: string;
  email: keyof NotificationPreferences;
  whatsapp: keyof NotificationPreferences;
}>;

export function NotificationPreferencesForm({
  preferences,
  whatsAppAvailable,
}: {
  preferences: NotificationPreferences;
  /** False until the office has connected a WhatsApp account. */
  whatsAppAvailable: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);

  async function save(formData: FormData) {
    setBusy(true);
    setNote(null);
    const result = await saveNotificationPreferencesAction(formData);
    setBusy(false);
    setNote({ ok: result.ok, message: result.message ?? (result.ok ? 'Saved.' : 'Not saved.') });
  }

  return (
    <form action={(formData) => void save(formData)} className="space-y-4">
      {GROUPS.map((group) => (
        <fieldset
          key={group.key}
          data-preference-group={group.key}
          className="rounded-md border border-line bg-surface p-5"
        >
          <legend className="px-1 font-serif text-lg font-semibold">{group.title}</legend>
          <p className="text-sm text-fg-muted">{group.description}</p>

          <div className="mt-4 space-y-2.5">
            <Switch
              name={group.email}
              defaultChecked={preferences[group.email]}
              label="Email"
            />
            <Switch
              name={group.whatsapp}
              defaultChecked={preferences[group.whatsapp]}
              label="WhatsApp"
              hint={
                whatsAppAvailable
                  ? undefined
                  : 'Not connected yet — this is remembered for when it is.'
              }
            />
          </div>
        </fieldset>
      ))}

      {note ? (
        <p
          role="status"
          className={
            note.ok
              ? 'text-sm font-medium text-positive-fg'
              : 'text-sm font-medium text-critical-fg'
          }
        >
          {note.message}
        </p>
      ) : null}

      <Button type="submit" disabled={busy} aria-busy={busy || undefined}>
        {busy ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}

function Switch({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-2.5 text-[0.9375rem]">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <span>
        {label}
        {hint ? <span className="block text-xs text-fg-subtle">{hint}</span> : null}
      </span>
    </label>
  );
}
