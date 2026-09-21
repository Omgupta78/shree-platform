import 'server-only';

import { emailConfig, whatsAppConfig } from '@/lib/notifications/config';
import { normaliseIndianNumber } from '@/lib/notifications/recipients';

/**
 * The two providers, behind one shape.
 *
 * Every send returns a `DeliveryOutcome` rather than throwing, because the
 * caller is a queue worker and the difference between "try again in a minute",
 * "there is nowhere to send this" and "the provider refused it outright" is
 * the whole of what the worker needs to decide. An exception collapses those
 * three into one.
 *
 * `skipped` is not a failure. It is what a message gets when the provider is
 * not configured, or the recipient has no address — nothing was attempted, so
 * there is nothing to retry, and recording it as failed would have somebody
 * investigating an outage that never happened.
 */

export { normaliseIndianNumber } from '@/lib/notifications/recipients';

export type DeliveryOutcome =
  | { status: 'sent' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string; retryable: boolean };

export interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface WhatsAppRequest {
  /** Ten digits as stored, or with a country code. Normalised here. */
  to: string;
  parameters: string[];
}

/* --------------------------------------------------------------- email -- */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendTransactionalEmail(request: EmailRequest): Promise<DeliveryOutcome> {
  const config = emailConfig();
  if (!config) {
    return { status: 'skipped', reason: 'No email provider is configured.' };
  }
  if (!request.to.includes('@')) {
    return { status: 'skipped', reason: 'The recipient has no email address.' };
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: [request.to],
        subject: request.subject,
        html: request.html,
        text: request.text,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      }),
      cache: 'no-store',
    });
  } catch {
    // Never reached the provider. Always worth another go.
    return { status: 'failed', reason: 'Could not reach the email provider.', retryable: true };
  }

  return outcomeFor(response, 'email');
}

/* ------------------------------------------------------------ whatsapp -- */

/**
 * Sends an approved template, and refuses to pretend otherwise.
 *
 * A business-initiated WhatsApp message may only be an approved template —
 * free text is permitted solely inside the 24-hour window after the customer
 * wrote to you, which is not the case when an advertisement is approved. So a
 * configuration with a token but no template name can send nothing, and that
 * is reported as `skipped` with a reason naming the missing setting rather
 * than as a string of failures from Meta.
 */
export async function sendWhatsAppNotification(request: WhatsAppRequest): Promise<DeliveryOutcome> {
  const config = whatsAppConfig();
  if (!config) {
    return { status: 'skipped', reason: 'No WhatsApp provider is configured.' };
  }
  if (!config.templateName) {
    return {
      status: 'skipped',
      reason: 'WHATSAPP_TEMPLATE_NAME is not set, and a business-initiated message must be an approved template.',
    };
  }

  const to = normaliseIndianNumber(request.to);
  if (!to) {
    return { status: 'skipped', reason: 'The recipient has no usable telephone number.' };
  }

  const endpoint = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: config.templateName,
          language: { code: config.templateLanguage },
          components: [
            {
              type: 'body',
              parameters: request.parameters.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
      cache: 'no-store',
    });
  } catch {
    return { status: 'failed', reason: 'Could not reach the WhatsApp provider.', retryable: true };
  }

  return outcomeFor(response, 'WhatsApp');
}

/* -------------------------------------------------------------- shared -- */

/**
 * What an HTTP status means for a queue.
 *
 * 4xx is the provider saying the request itself is wrong — a malformed
 * address, an unapproved template, a revoked key. Retrying that sends the same
 * wrong request again, so it is failed outright. 429 and 5xx are the provider
 * saying "not now", which is exactly what a retry is for.
 */
async function outcomeFor(response: Response, provider: string): Promise<DeliveryOutcome> {
  if (response.ok) return { status: 'sent' };

  // Read a short reason for the office. Never the whole body: a provider
  // error can echo the request, and the request contains the message.
  let detail = '';
  try {
    const body: unknown = await response.json();
    const envelope = body as { message?: unknown; error?: { message?: unknown } } | null;
    const text = envelope?.error?.message ?? envelope?.message;
    if (typeof text === 'string') detail = ` ${text}`;
  } catch {
    /* No JSON body. The status is enough. */
  }

  const retryable = response.status === 429 || response.status >= 500;
  return {
    status: 'failed',
    reason: `The ${provider} provider answered ${response.status}.${detail}`.slice(0, 400),
    retryable,
  };
}
