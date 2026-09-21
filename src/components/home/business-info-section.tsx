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

          <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
            <div className="flex gap-3 p-5">
              <MapPinIcon size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
              <div>
                <dt className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
                  Office
                </dt>
                <dd className="mt-1 text-sm">{SITE.address}</dd>
              </div>
            </div>

            <div className="flex gap-3 p-5">
              <PhoneIcon size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
              <div>
                <dt className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
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
            </div>

            <div className="flex gap-3 p-5">
              <MailIcon size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
              <div>
                <dt className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
                  Email
                </dt>
                <dd className="mt-1 text-sm">
                  <a href={`mailto:${SITE.email}`} className="hover:text-primary">
                    {SITE.email}
                  </a>
                </dd>
              </div>
            </div>

            <div className="flex gap-3 p-5">
              <GlobeIcon size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
              <div>
                <dt className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
                  Website
                </dt>
                <dd className="mt-1 text-sm">{SITE.website}</dd>
              </div>
            </div>
          </dl>
        </div>
      </Container>
    </section>
  );
}
