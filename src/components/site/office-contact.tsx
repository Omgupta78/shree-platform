import { MailIcon, MapPinIcon, PhoneIcon, WhatsAppIcon } from '@/components/ui/icons';
import { SITE } from '@/config/site';
import { getOfficeDetails } from '@/lib/data/settings';
import { formatPhone, telHref, whatsAppHref } from '@/lib/format';

/**
 * The office's own details, in one block.
 *
 * Read from `app_settings` through `getOfficeDetails()`, with
 * `config/site.ts` as the field-by-field fallback — the same source the
 * footer uses, so the address on the contact page and the address at the
 * bottom of every page cannot say different things.
 *
 * There are no opening hours here. Nobody has told me what they are, and a
 * business whose door is shut when its website said it would be open has been
 * let down by its website.
 */
export async function OfficeContact({ heading }: { heading?: string } = {}) {
  const office = await getOfficeDetails();

  return (
    <div className="rounded-md border border-line bg-surface p-5 sm:p-6">
      {heading ? (
        <h2 className="font-serif text-xl font-semibold">{heading}</h2>
      ) : null}

      <address className={`space-y-4 text-[0.9375rem] not-italic ${heading ? 'mt-4' : ''}`}>
        <p className="flex gap-3">
          <MapPinIcon size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
          <span>{office.address}</span>
        </p>

        {office.phones.map((phone) => (
          <p key={phone} className="flex items-center gap-3">
            <PhoneIcon size={18} className="shrink-0 text-fg-subtle" />
            <a href={telHref(phone)} className="font-medium text-primary hover:underline">
              {formatPhone(phone)}
            </a>
          </p>
        ))}

        {office.whatsapp ? (
          <p className="flex items-center gap-3">
            <WhatsAppIcon size={18} className="shrink-0 text-fg-subtle" />
            <a
              href={whatsAppHref(office.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              Message us on WhatsApp
            </a>
          </p>
        ) : null}

        <p className="flex items-center gap-3">
          <MailIcon size={18} className="shrink-0 text-fg-subtle" />
          <a href={`mailto:${office.email}`} className="font-medium text-primary hover:underline">
            {office.email}
          </a>
        </p>
      </address>

      <p className="mt-5 border-t border-line pt-4 text-sm text-fg-muted">
        The printed edition comes out every {SITE.publishDay}. Advertisements appear on this site
        as soon as they are approved.
      </p>
    </div>
  );
}
