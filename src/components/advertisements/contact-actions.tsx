'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { MailIcon, PhoneIcon, WhatsAppIcon } from '@/components/ui/icons';
import { contactLinks, maskPhone } from '@/lib/classifieds/contact';
import { formatPhone } from '@/lib/format';
import type { Advertisement } from '@/types/content';

/**
 * Contact buttons.
 *
 * The number is masked until the reader asks for it. That is standard practice
 * in classifieds — it makes bulk scraping of advertisers' numbers meaningfully
 * harder — and it is also the natural place to count a contact event once
 * `ad_events` is connected.
 *
 * When no number is on the advertisement the buttons still render, disabled,
 * with a line explaining why. In development that is always the case: the mock
 * dataset deliberately carries no telephone numbers.
 */
export function ContactActions({
  advertisement,
  layout = 'stacked',
}: {
  advertisement: Advertisement;
  layout?: 'stacked' | 'bar';
}) {
  const [revealed, setRevealed] = useState(false);
  const links = contactLinks(advertisement);
  const phone = advertisement.contactPhone;

  if (!links.available) {
    return (
      <div data-contact={layout}>
        <div className={layout === 'bar' ? 'flex gap-2' : 'space-y-2.5'}>
          <Button disabled fullWidth size="lg">
            <PhoneIcon size={17} />
            Call
          </Button>
          <Button disabled fullWidth size="lg" variant="whatsapp">
            <WhatsAppIcon size={18} />
            WhatsApp
          </Button>
        </div>

        {/* A disabled button with no explanation reads as a broken one, so the
            reason is stated in both layouts — briefly in the sticky bar. */}
        <p className="pt-2 text-xs leading-relaxed text-fg-subtle">
          {layout === 'bar'
            ? 'The sample advertisements carry no telephone numbers.'
            : 'Contact details appear here once an advertiser publishes an advertisement. The sample advertisements carry no telephone numbers.'}
        </p>
      </div>
    );
  }

  if (layout === 'bar') {
    return (
      <div data-contact="bar" className="flex gap-2">
        {links.call ? (
          <Button href={links.call} fullWidth size="lg">
            <PhoneIcon size={17} />
            Call
          </Button>
        ) : null}
        {links.whatsapp ? (
          <Button
            href={links.whatsapp}
            variant="whatsapp"
            fullWidth
            size="lg"
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsAppIcon size={18} />
            WhatsApp
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div data-contact="stacked" className="space-y-2.5">
      {phone && !revealed ? (
        <Button onClick={() => setRevealed(true)} fullWidth size="lg">
          <PhoneIcon size={17} />
          Show number ({maskPhone(phone)})
        </Button>
      ) : null}

      {phone && revealed && links.call ? (
        <Button href={links.call} fullWidth size="lg">
          <PhoneIcon size={17} />
          {formatPhone(phone)}
        </Button>
      ) : null}

      {links.whatsapp ? (
        <Button
          href={links.whatsapp}
          variant="whatsapp"
          fullWidth
          size="lg"
          target="_blank"
          rel="noopener noreferrer"
        >
          <WhatsAppIcon size={18} />
          Message on WhatsApp
        </Button>
      ) : null}

      {links.email ? (
        <Button href={links.email} variant="secondary" fullWidth size="lg">
          <MailIcon size={17} />
          Send an email
        </Button>
      ) : null}
    </div>
  );
}
