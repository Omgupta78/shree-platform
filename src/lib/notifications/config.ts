import 'server-only';

/**
 * Who actually sends the messages.
 *
 * Both providers are optional, separately. With neither configured the site
 * behaves exactly as it does today: notifications are raised, the in-app
 * centre fills, and the queued email and WhatsApp rows are marked `skipped`
 * with a reason saying so rather than piling up as failures. That is the state
 * Shree Classified is in until somebody opens an account with a provider.
 *
 * `server-only` makes importing this from a Client Component a build error.
 * No provider key is ever given a `NEXT_PUBLIC_` prefix, and none is needed in
 * the browser: nothing about sending happens there.
 */

function read(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface EmailConfig {
  apiKey: string;
  /** `Shree Classified <no-reply@example.in>`, or a bare address. */
  from: string;
  /** Where a reply goes. The office's own address, not the sending domain. */
  replyTo: string | null;
}

export function emailConfig(): EmailConfig | null {
  const apiKey = read('RESEND_API_KEY');
  const from = read('EMAIL_FROM');
  if (!apiKey || !from) return null;
  return { apiKey, from, replyTo: read('EMAIL_REPLY_TO') };
}

/**
 * WhatsApp, through Meta's official Cloud API.
 *
 * `templateName` is not optional in practice and the reason is worth writing
 * down: a business-initiated WhatsApp message — which every notification here
 * is — may only be an approved template. Free text is permitted solely inside
 * the 24-hour window after a customer writes to you, which is not the
 * situation when an advertisement is approved at ten in the morning. So a
 * configuration with a token but no approved template can send nothing, and
 * this module says so plainly rather than letting the provider refuse each
 * message one at a time.
 */
export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  templateName: string | null;
  templateLanguage: string;
  apiVersion: string;
}

export function whatsAppConfig(): WhatsAppConfig | null {
  const accessToken = read('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = read('WHATSAPP_PHONE_NUMBER_ID');
  if (!accessToken || !phoneNumberId) return null;

  return {
    accessToken,
    phoneNumberId,
    templateName: read('WHATSAPP_TEMPLATE_NAME'),
    templateLanguage: read('WHATSAPP_TEMPLATE_LANGUAGE') ?? 'en',
    apiVersion: read('WHATSAPP_API_VERSION') ?? 'v21.0',
  };
}

export function isEmailConfigured(): boolean {
  return emailConfig() !== null;
}

export function isWhatsAppConfigured(): boolean {
  const config = whatsAppConfig();
  return config !== null && config.templateName !== null;
}
