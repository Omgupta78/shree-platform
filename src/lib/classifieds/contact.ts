import { SITE } from '@/config/site';
import { telHref, whatsAppHref } from '@/lib/format';
import type { Advertisement } from '@/types/content';

/**
 * Contact link construction, in one place so the detail page, the sticky
 * mobile bar and any future contact surface all produce identical links.
 *
 * Nothing here talks to WhatsApp's API — a `wa.me` link is an ordinary URL
 * that opens the app with the message prefilled. The Business API integration,
 * if it is ever wanted, replaces `whatsAppEnquiryHref` alone.
 */

/** The enquiry message an interested reader sends an advertiser. */
export function enquiryMessage(advertisement: Advertisement): string {
  return (
    `Hi, I found your advertisement on ${SITE.name} regarding ` +
    `"${advertisement.title}" (${advertisement.reference}). ` +
    `I am interested and would like more information.`
  );
}

export interface ContactLinks {
  /** Null when the advertiser supplied no number. */
  call: string | null;
  whatsapp: string | null;
  email: string | null;
  /** True when at least one channel is available. */
  available: boolean;
}

export function contactLinks(advertisement: Advertisement): ContactLinks {
  const call = advertisement.contactPhone ? telHref(advertisement.contactPhone) : null;
  const whatsapp = advertisement.contactWhatsapp
    ? whatsAppHref(advertisement.contactWhatsapp, enquiryMessage(advertisement))
    : null;
  const email = advertisement.contactEmail
    ? `mailto:${advertisement.contactEmail}?subject=${encodeURIComponent(
        `Enquiry — ${advertisement.title} (${advertisement.reference})`,
      )}&body=${encodeURIComponent(enquiryMessage(advertisement))}`
    : null;

  return { call, whatsapp, email, available: Boolean(call || whatsapp || email) };
}

/** Masked for display: 9719419913 becomes +91 97194 ••••• until revealed. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return phone;
  return `+91 ${digits.slice(0, 5)} •••••`;
}
