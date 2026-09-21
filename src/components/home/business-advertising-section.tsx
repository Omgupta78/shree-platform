import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/ui/icons';
import { Section, SectionHeading } from '@/components/ui/section';
import { SITE } from '@/config/site';
import { whatsAppHref } from '@/lib/format';

/** Who the office sells to, taken from the advertisers the paper carries. */
const AUDIENCE: readonly string[] = [
  'Local businesses',
  'Shops and showrooms',
  'Educational institutes',
  'Property businesses',
  'Service providers',
  'Professionals',
  'Organisations and societies',
] as const;

export function BusinessAdvertisingSection() {
  return (
    <Section labelledBy="business-heading">
      <SectionHeading
        id="business-heading"
        eyebrow="For advertisers"
        title="Promote your business"
        description="Shree Classified offers advertising in both classified and display formats, in print and online. Our office will help you choose the right one."
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <ul className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
          {AUDIENCE.map((item) => (
            <li
              key={item}
              className="flex items-baseline gap-3 border-b border-line py-3.5 text-[0.9375rem]"
            >
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {item}
            </li>
          ))}
        </ul>

        <div className="rounded-lg border border-line-strong bg-surface-sunken p-6">
          <h3 className="font-serif text-xl font-semibold">Start advertising</h3>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Tell us what you want to advertise and our office will suggest the format and
            placement that suits it.
          </p>
          <div className="mt-6 space-y-2.5">
            <Button href="/post-ad" size="lg" fullWidth>
              Start Advertising
            </Button>
            <Button
              href={whatsAppHref(
                SITE.whatsapp,
                'Hello Shree Classified, I would like to enquire about advertising.',
              )}
              variant="whatsapp"
              size="lg"
              fullWidth
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon size={18} />
              Enquire on WhatsApp
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
