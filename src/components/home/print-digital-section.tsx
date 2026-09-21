import { Button } from '@/components/ui/button';
import { SITE } from '@/config/site';
import { Container } from '@/components/ui/container';
import { GlobeIcon, NewspaperIcon, ShareIcon } from '@/components/ui/icons';
import type { ComponentType, SVGProps } from 'react';

interface Channel {
  name: string;
  detail: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
}

const CHANNELS: readonly Channel[] = [
  {
    name: 'Newspaper',
    detail: 'Printed in the weekly edition and distributed across the district.',
    Icon: NewspaperIcon,
  },
  {
    name: 'Website',
    detail: 'Listed online where readers can search for it all week.',
    Icon: GlobeIcon,
  },
  {
    name: 'Digital promotion',
    detail: 'Shared through our digital channels to extend its reach.',
    Icon: ShareIcon,
  },
] as const;

/**
 * The print-plus-digital proposition, which is the argument for this business
 * over a purely online marketplace. No prices are quoted: the rate card is a
 * conversation with the office.
 */
export function PrintDigitalSection() {
  return (
    <section
      aria-labelledby="channels-heading"
      className="bg-chrome py-14 text-chrome-fg sm:py-20"
    >
      <Container>
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.16em] text-gold-400 uppercase">
            Print &amp; digital
          </p>
          <h2
            id="channels-heading"
            className="mt-3 font-serif text-3xl leading-tight font-semibold sm:text-4xl"
          >
            One advertisement. Multiple platforms.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-chrome-muted">
            An advertisement booked with Shree Classified need not stop at the printed page.
            The same campaign can run in the newspaper, on this website and through our
            digital promotion — reaching readers on paper and on their phones.
          </p>
        </div>

        <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-chrome-border bg-chrome-border sm:grid-cols-3">
          {CHANNELS.map((channel, index) => (
            <li key={channel.name} className="bg-chrome p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <span className="text-gold-400">
                  <channel.Icon size={22} />
                </span>
                <span className="text-[0.6875rem] font-semibold tracking-[0.16em] text-chrome-muted uppercase">
                  Step {index + 1}
                </span>
              </div>
              <h3 className="mt-4 font-serif text-xl font-semibold">{channel.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-chrome-muted">
                {channel.detail}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button href="/post-ad" size="lg">
            Advertise With Shree Classified
          </Button>
          <Button href={`tel:+91${SITE.phones[0]}`} variant="onDark" size="lg">
            Call {SITE.phones[0]}
          </Button>
        </div>
      </Container>
    </section>
  );
}
