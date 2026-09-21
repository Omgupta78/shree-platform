'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { NotSignedInError, requireUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Marking notifications read, and choosing which channels to hear on.
 *
 * Nothing here takes a user id. The one whose notifications are marked, and
 * whose preferences are saved, is the one holding the session — read from a
 * verified token on the server. `mark_notification_read()` matches on
 * `user_id = auth.uid()` inside the database, so a request naming somebody
 * else's notification updates no rows and is told nothing about whether it
 * exists; the preferences policy does the same for the settings below. A
 * client that could name a user id could read another advertiser's post.
 */

export interface NotificationActionResult {
  ok: boolean;
  message?: string;
  /** How many were marked, for "12 marked as read". */
  count?: number;
}

const UNAVAILABLE: NotificationActionResult = {
  ok: false,
  message: 'The site is running without a database connection.',
};

async function signedIn(): Promise<NotificationActionResult | null> {
  try {
    await requireUser();
    return null;
  } catch (error) {
    if (error instanceof NotSignedInError) {
      return { ok: false, message: 'Please sign in again.' };
    }
    throw error;
  }
}

export async function markNotificationReadAction(id: string): Promise<NotificationActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;
  const refusal = await signedIn();
  if (refusal) return refusal;

  if (!z.uuid().safeParse(id).success) {
    return { ok: false, message: 'That is not a notification.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('mark_notification_read', { p_id: id });
  if (error) return { ok: false, message: 'That could not be saved.' };

  revalidatePath('/my-ads', 'layout');
  return { ok: true, count: data ? 1 : 0 };
}

export async function markAllNotificationsReadAction(): Promise<NotificationActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;
  const refusal = await signedIn();
  if (refusal) return refusal;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('mark_all_notifications_read');
  if (error) return { ok: false, message: 'That could not be saved.' };

  revalidatePath('/my-ads', 'layout');
  return { ok: true, count: Number(data ?? 0) };
}

/* ---------------------------------------------------------- preferences -- */

const preferencesSchema = z.object({
  email_advertisement_updates: z.boolean(),
  email_payment_updates: z.boolean(),
  email_expiry_reminders: z.boolean(),
  whatsapp_advertisement_updates: z.boolean(),
  whatsapp_payment_updates: z.boolean(),
  whatsapp_expiry_reminders: z.boolean(),
});

export async function saveNotificationPreferencesAction(
  formData: FormData,
): Promise<NotificationActionResult> {
  if (!isSupabaseConfigured) return UNAVAILABLE;
  const refusal = await signedIn();
  if (refusal) return refusal;

  const user = await requireUser();

  const parsed = preferencesSchema.safeParse({
    email_advertisement_updates: formData.get('email_advertisement_updates') === 'on',
    email_payment_updates: formData.get('email_payment_updates') === 'on',
    email_expiry_reminders: formData.get('email_expiry_reminders') === 'on',
    whatsapp_advertisement_updates: formData.get('whatsapp_advertisement_updates') === 'on',
    whatsapp_payment_updates: formData.get('whatsapp_payment_updates') === 'on',
    whatsapp_expiry_reminders: formData.get('whatsapp_expiry_reminders') === 'on',
  });
  if (!parsed.success) return { ok: false, message: 'Please try again.' };

  // The id comes from the verified session, and the row-level policy checks it
  // again — `user_id = auth.uid()` on both the using and the with-check side,
  // so an upset id cannot write another advertiser's row either.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: user.id, ...parsed.data }, { onConflict: 'user_id' });

  if (error) return { ok: false, message: 'Those settings could not be saved.' };

  revalidatePath('/my-ads/settings/notifications');
  return { ok: true, message: 'Saved.' };
}
