import 'server-only';

import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { MyNotificationRow, NotificationPreferencesRow } from '@/types/database';

/**
 * Reading notifications.
 *
 * Through `my_notifications`, whose WHERE clause is `user_id = auth.uid()`.
 * There is no ownership check in this file and there should not be one: a
 * check written here is a check the next page can forget to write.
 */

export interface NotificationInbox {
  items: MyNotificationRow[];
  unread: number;
}

/** The most recent few, for the bell. */
export async function getNotificationInbox(limit = 8): Promise<NotificationInbox> {
  if (!isSupabaseConfigured) return { items: [], unread: 0 };

  const supabase = await createSupabaseServerClient();

  const [{ data }, { count }] = await Promise.all([
    supabase.from('my_notifications').select('*').order('created_at', { ascending: false }).limit(limit),
    supabase
      .from('my_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false),
  ]);

  return { items: data ?? [], unread: count ?? 0 };
}

/** Everything, for the notification centre. */
export async function getNotifications(limit = 100): Promise<MyNotificationRow[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('my_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}

/**
 * The defaults, written out here as well as in the table.
 *
 * A new account has no preferences row — `raise_notification()` reads the same
 * defaults with `coalesce` — so the settings page has something to show before
 * anybody has saved anything. The two must agree; if they drift, the page
 * shows switches that do not describe what is happening.
 */
export interface NotificationPreferences {
  email_advertisement_updates: boolean;
  email_payment_updates: boolean;
  email_expiry_reminders: boolean;
  whatsapp_advertisement_updates: boolean;
  whatsapp_payment_updates: boolean;
  whatsapp_expiry_reminders: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email_advertisement_updates: true,
  email_payment_updates: true,
  email_expiry_reminders: true,
  // Off. A message to somebody's telephone is not something to opt them into.
  whatsapp_advertisement_updates: false,
  whatsapp_payment_updates: false,
  whatsapp_expiry_reminders: false,
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  if (!isSupabaseConfigured) return { ...DEFAULT_NOTIFICATION_PREFERENCES };

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('notification_preferences')
    .select('*')
    .maybeSingle();

  if (!data) return { ...DEFAULT_NOTIFICATION_PREFERENCES };

  const row = data as NotificationPreferencesRow;
  return {
    email_advertisement_updates: row.email_advertisement_updates,
    email_payment_updates: row.email_payment_updates,
    email_expiry_reminders: row.email_expiry_reminders,
    whatsapp_advertisement_updates: row.whatsapp_advertisement_updates,
    whatsapp_payment_updates: row.whatsapp_payment_updates,
    whatsapp_expiry_reminders: row.whatsapp_expiry_reminders,
  };
}
