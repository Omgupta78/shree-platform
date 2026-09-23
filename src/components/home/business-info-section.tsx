import { Container } from '@/components/ui/container';
import { GlobeIcon, MailIcon, MapPinIcon, PhoneIcon } from '@/components/ui/icons';
import { SITE } from '@/config/site';
import { formatPhone, telHref } from '@/lib/format';

/**
 * Business identity.
 *
 * Only facts printed in the edition appear here — name, publisher, address,
 * email and website. No founding year, years of experience, circulation
 * figure, readership number or award is claimed, because none is printed.
 */
export function BusinessInfoSection() {
  return (
    <section aria-labelledby="about-heading" className="border-t border-line py-14">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-start">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              About the publication
            </p>
            <h2
              id="about-heading"
              className="mt-3 font-serif text-2xl font-semibold sm:text-3xl"
            >
              {SITE.name}
            </h2>
            <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-fg-muted">
              A classified and advertising publication from {SITE.city}, {SITE.state},
              published by {SITE.publisher}. The printed edition appears every{' '}
              {SITE.publishDay} and carries both classified notices and display advertising
              from businesses and institutions across the district.
            </p>
          </div>

          {/*
            `<dl>` may contain a `<div>` wrapping each term-and-definition pair,
            but only one level of it — a `<div>` inside that `<div>` makes the
            `<dt>` no longer a child of the group, and a screen reader stops
            announcing the pairs as a list. So the icon sits inside the `<dt>`
            beside its label rather than in a column of its own.
          */}
          <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
            <div className="p-5">
              <dt className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
                <MapPinIcon size={16} className="shrink-0" />
                Office
              </dt>
              <dd className="mt-1 text-sm">{SITE.address}</dd>
            </div>

            <div className="p-5">
              <dt className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
                <PhoneIcon size={16} className="shrink-0" />
                Telephone
              </dt>
              <dd className="mt-1 space-x-3 text-sm">
                {SITE.phones.map((phone) => (
                  <a key={phone} href={telHref(phone)} className="hover:text-primary">
                    {formatPhone(phone)}
                  </a>
                ))}
              </dd>
            </div>

            <div className="p-5">
              <dt className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
                <MailIcon size={16} className="shrink-0" />
                Email
              </dt>
              <dd className="mt-1 text-sm">
                <a href={`mailto:${SITE.email}`} className="hover:text-primary">
                  {SITE.email}
                </a>
              </dd>
            </div>

            <div className="p-5">
              <dt className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
                <GlobeIcon size={16} className="shrink-0" />
                Website
              </dt>
              <dd className="mt-1 text-sm">{SITE.website}</dd>
            </div>
          </dl>
        </div>
      </Container>
    </section>
  );
}
