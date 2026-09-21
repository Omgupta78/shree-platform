import { SITE } from '@/config/site';
import { formatPhone } from '@/lib/format';
import type { NotificationType } from '@/types/database';

/**
 * What an email says, and what it looks like.
 *
 * Version-controlled, in one file, rather than rows somebody edits in an admin
 * screen. A template is code: it has a subject that must match its body, a
 * call to action that must point somewhere real, and an escaping rule that
 * must not be forgotten. `/admin/notifications/templates` shows them; it does
 * not let anybody rewrite them, which is deliberate — a visual email editor is
 * a way to ship a broken email on a Sunday.
 *
 * Nothing here imports `server-only`: these are pure functions over strings,
 * they hold no credentials, and they are exercised directly by the test
 * runner in Node.
 */

export interface NotificationMessage {
  /** The in-app title, already written by the database. */
  title: string;
  /** The in-app body, already written by the database. */
  body: string;
  recipientName: string;
  /** A path on this site, or null. Turned into an absolute URL for email. */
  href: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/* ------------------------------------------------------------ escaping -- */

/**
 * The advertiser's own name and an advertisement's reference both end up in
 * this HTML, and a name is whatever somebody typed. Escaped here, once, rather
 * than trusted because "it is only a name".
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------- subjects -- */

/**
 * One subject per type.
 *
 * Written out rather than derived from the title, because a subject line is
 * read in a list of thirty other subject lines and wants the brand in it,
 * while an in-app title is read under a heading that already says where it is.
 */
const SUBJECTS: Record<NotificationType, string> = {
  advertisement_submitted: `We have your ${SITE.name} advertisement`,
  advertisement_approved: `Your ${SITE.name} advertisement has been approved`,
  advertisement_rejected: `About your ${SITE.name} advertisement`,
  advertisement_changes_requested: `Your ${SITE.name} advertisement needs a change`,
  advertisement_expiring: `Your ${SITE.name} advertisement is ending soon`,
  advertisement_expired: `Your ${SITE.name} advertisement has finished its run`,
  renewal_submitted: `We have your ${SITE.name} renewal request`,
  renewal_approved: `Your ${SITE.name} renewal has been approved`,
  renewal_rejected: `About your ${SITE.name} renewal`,
  payment_successful: `Payment received — ${SITE.name}`,
  payment_failed: `Your ${SITE.name} payment did not complete`,
  payment_cancelled: `Your ${SITE.name} payment was cancelled`,
  // The office's own. Plainer, because they arrive in a working inbox.
  staff_advertisement_submitted: `[${SITE.name}] New advertisement to review`,
  staff_renewal_submitted: `[${SITE.name}] Renewal waiting for a decision`,
  staff_payment_received: `[${SITE.name}] Payment received`,
  staff_report_received: `[${SITE.name}] An advertisement has been reported`,
};

/** The wording on the button, where there is one. */
const ACTIONS: Partial<Record<NotificationType, string>> = {
  advertisement_submitted: 'View your advertisement',
  advertisement_approved: 'View your advertisement',
  advertisement_rejected: 'View your advertisement',
  advertisement_changes_requested: 'Edit your advertisement',
  advertisement_expiring: 'Renew your advertisement',
  advertisement_expired: 'Renew your advertisement',
  renewal_submitted: 'View your advertisement',
  renewal_approved: 'View your advertisement',
  renewal_rejected: 'View your advertisement',
  payment_successful: 'View your receipt',
  payment_failed: 'Try the payment again',
  payment_cancelled: 'View your receipt',
  staff_advertisement_submitted: 'Open the queue',
  staff_renewal_submitted: 'Open the renewals',
  staff_payment_received: 'Open the ledger',
  staff_report_received: 'Open the reports',
};

export function subjectFor(type: NotificationType): string {
  return SUBJECTS[type];
}

export function actionFor(type: NotificationType): string | null {
  return ACTIONS[type] ?? null;
}

/* ---------------------------------------------------------------- email -- */

/**
 * One layout for every message.
 *
 * Tables and inline styles, because an email client is not a browser: Gmail
 * strips `<style>` blocks, Outlook renders through Word, and neither supports
 * flexbox. A single centred column at 100% width with a max of 560px is what
 * reads on a telephone without a media query, which several of these clients
 * also ignore.
 */
export function renderEmail(type: NotificationType, message: NotificationMessage, origin: string): RenderedEmail {
  const subject = subjectFor(type);
  const action = actionFor(type);
  const url = message.href ? `${origin}${message.href}` : null;
  const name = message.recipientName.trim() || 'there';

  const greeting = `Hello ${name},`;
  const lines = [greeting, '', message.body];
  if (url && action) lines.push('', `${action}: ${url}`);
  lines.push(
    '',
    '—',
    `${SITE.publisher}, ${SITE.city}`,
    SITE.phones.map(formatPhone).join('  ·  '),
    'This is a message about an advertisement you booked with us.',
  );

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e1dc;">

      <tr><td style="padding:20px 24px;border-bottom:2px solid #1a1a1a;">
        <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;color:#1a1a1a;">Shree</span>
        <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:2px;color:#9b1c1c;padding-left:8px;">CLASSIFIED</span>
      </td></tr>

      <tr><td style="padding:28px 24px 8px;">
        <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.3;font-weight:600;color:#1a1a1a;">${escapeHtml(message.title)}</h1>
      </td></tr>

      <tr><td style="padding:0 24px 8px;">
        <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#3d3a35;">${escapeHtml(greeting)}</p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#3d3a35;">${escapeHtml(message.body)}</p>
      </td></tr>

      ${
        url && action
          ? `<tr><td style="padding:22px 24px 4px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#9b1c1c;">
          <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(action)}</a>
        </td></tr></table>
      </td></tr>`
          : ''
      }

      <tr><td style="padding:24px;">
        <hr style="border:none;border-top:1px solid #e3e1dc;margin:0 0 14px;">
        <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b675f;">
          ${escapeHtml(SITE.publisher)}, ${escapeHtml(SITE.city)}<br>
          ${SITE.phones.map((phone) => escapeHtml(formatPhone(phone))).join(' &middot; ')}
        </p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8a857c;">
          This is a message about an advertisement you booked with us, not a newsletter.
          You can change which of these you receive in your account settings.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject, html, text: lines.join('\n') };
}

/* ------------------------------------------------------------- whatsapp -- */

/**
 * What goes into an approved WhatsApp template's body parameters.
 *
 * Meta's templates take positional variables, and their rules are strict about
 * what a parameter may contain: no newlines, no tabs, and no runs of four or
 * more spaces. A message that breaks those is rejected by the API rather than
 * delivered oddly, so it is flattened here instead of being discovered in a
 * provider log.
 */
export function whatsAppParameters(message: NotificationMessage, origin: string): string[] {
  const flatten = (value: string) => value.replace(/\s+/g, ' ').trim();
  return [
    flatten(message.recipientName) || 'there',
    flatten(message.body),
    message.href ? `${origin}${message.href}` : `${origin}/my-ads`,
  ];
}
