import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/seo/metadata';

import { OfficeContact } from '@/components/site/office-contact';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { CheckIcon } from '@/components/ui/icons';
import { ADVERTISEMENT_TYPES } from '@/config/ad-types';
import { PRICING_PENDING_NOTE } from '@/config/packages';
import { SITE } from '@/config/site';
import { getPackageConfigs } from '@/lib/data/packages';
import { formatPaiseAsRupees, formatPhone } from '@/lib/format';
import { isChargeable } from '@/lib/payments/amounts';

export const metadata: Metadata = publicMetadata({
  title: 'Advertise with us',
  description: `Book a classified or display advertisement with ${SITE.name} — in the printed edition every ${SITE.publishDay} and online in ${SITE.city} and Haridwar district.`,
  path: '/advertise',
});

/**
 * What we sell, and how to buy it.
 *
 * The packages are read from the database, so their run lengths, photograph
 * limits and prices are whatever the office has set at `/admin/packages` —
 * this page cannot fall out of step with what the submission form charges,
 * because both read the same rows.
 *
 * While a package carries no price, which is how the site ships, the card
 * says the rate is quoted by the office rather than showing a zero. That is
 * the truth: Shree Advertising quote their rates and have not published them.
 */
export default async function AdvertisePage() {
  const packages = await getPackageConfigs();
  const anyPriced = packages.some((item) => isChargeable(item.price));

  return (
    <Container className="py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-serif text-3xl font-semibold sm:text-4xl">
          Advertise with {SITE.name}
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-fg-muted">
          In the printed edition every {SITE.publishDay}, and online the moment it is approved.
          Across {SITE.city} and Haridwar district.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button href="/post-ad" size="lg">
            Post an advertisement
          </Button>
          <Button href={`tel:+91${SITE.phones[0]}`} variant="secondary" size="lg">
            Call {formatPhone(SITE.phones[0])}
          </Button>
        </div>

        {/* ------------------------------------------------ what you can book -- */}
        <section className="mt-12">
          <h2 className="font-serif text-2xl font-semibold">Two kinds of advertisement</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {ADVERTISEMENT_TYPES.map((type) => (
              <div
                key={type.id}
                className="flex flex-col rounded-md border border-line bg-surface p-5 sm:p-6"
              >
                <h3 className="font-serif text-xl font-semibold">{type.name}</h3>
                <p className="mt-1 text-sm text-fg-subtle">{type.tagline}</p>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-fg-muted">
                  {type.description}
                </p>

                <p className="mt-5 text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
                  Typically booked for
                </p>
                <ul className="mt-2 space-y-1.5 text-[0.9375rem] text-fg-muted">
                  {type.examples.map((example) => (
                    <li key={example} className="flex gap-2">
                      <CheckIcon size={15} className="mt-1 shrink-0 text-positive-fg" />
                      <span>{example}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-5 border-t border-line pt-4 text-sm text-fg-subtle">
                  {type.handling}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------- packages -- */}
        <section className="mt-12">
          <h2 className="font-serif text-2xl font-semibold">Classified packages</h2>
          <p className="mt-2 max-w-2xl text-[0.9375rem] text-fg-muted">
            Every classified advertisement runs on one of these. A display advertisement is
            quoted separately, by size.
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {packages.map((item) => {
              const priced = isChargeable(item.price);
              return (
                <div
                  key={item.id}
                  data-package={item.id}
                  className="flex flex-col rounded-md border border-line bg-surface p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-serif text-lg font-semibold">{item.name}</h3>
                    {item.featured ? <Badge tone="featured">Featured</Badge> : null}
                  </div>

                  <p className="mt-1 text-sm text-fg-muted">{item.summary}</p>

                  <p
                    className={
                      priced
                        ? 'mt-4 font-serif text-2xl font-semibold tabular-nums'
                        : 'mt-4 text-sm font-semibold text-fg-subtle'
                    }
                  >
                    {priced ? formatPaiseAsRupees(item.price) : 'Rate on application'}
                  </p>

                  <ul className="mt-4 space-y-1.5 text-sm text-fg-muted">
                    <li className="flex gap-2">
                      <CheckIcon size={15} className="mt-0.5 shrink-0 text-positive-fg" />
                      <span>
                        Runs for{' '}
                        <strong className="font-medium tabular-nums">{item.durationDays}</strong>{' '}
                        days after approval
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <CheckIcon size={15} className="mt-0.5 shrink-0 text-positive-fg" />
                      <span>
                        Up to{' '}
                        <strong className="font-medium tabular-nums">{item.maxImages}</strong>{' '}
                        {item.maxImages === 1 ? 'photograph' : 'photographs'}
                      </span>
                    </li>
                    {item.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <CheckIcon size={15} className="mt-0.5 shrink-0 text-positive-fg" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <p
            className={
              anyPriced
                ? 'mt-5 rounded-sm border border-line bg-surface-sunken p-4 text-sm leading-relaxed text-fg-muted'
                : 'mt-5 rounded-sm border border-accent-line bg-accent-surface p-4 text-sm leading-relaxed text-accent-fg'
            }
          >
            {anyPriced
              ? 'You choose a package while writing your advertisement, and pay once you have sent it. Paying does not publish an advertisement — every one is read by our office first.'
              : PRICING_PENDING_NOTE}
          </p>
        </section>

        {/* ------------------------------------------------------ the process -- */}
        <section className="mt-12">
          <h2 className="font-serif text-2xl font-semibold">What happens after you send it</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              {
                title: 'We read it',
                body: 'Every advertisement is checked by our office before it appears. If something needs correcting, it comes back to you with a note.',
              },
              {
                title: 'It goes up',
                body: 'Once approved it is live on the site, and runs for the length its package carries. Your contact details appear exactly as you chose.',
              },
              {
                title: 'You can renew it',
                body: 'You are shown when a run is ending. Renewing sends it back through the same review, and the new run starts on approval.',
              },
            ].map((step, index) => (
              <li key={step.title} className="rounded-md border border-line bg-surface p-5">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-surface font-serif font-semibold text-primary tabular-nums"
                >
                  {index + 1}
                </span>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-fg-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* --------------------------------------------------------- contact -- */}
        <section className="mt-12 grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="font-serif text-2xl font-semibold">Talk to the advertising team</h2>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-fg-muted">
              A display advertisement — your own artwork, placed within a page or across a spread
              — is quoted by size. Ring the office and we will talk it through, or send your
              request through the form and we will come back to you.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button href="/post-ad">Start a booking</Button>
              <Button href="/contact" variant="secondary">
                Contact us
              </Button>
            </div>
          </div>

          <OfficeContact heading="The office" />
        </section>
      </div>
    </Container>
  );
}
