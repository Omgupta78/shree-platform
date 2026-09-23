import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';

import { OfficeContact } from '@/components/site/office-contact';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { SITE } from '@/config/site';
import { getOfficeDetails } from '@/lib/data/settings';
import { JsonLd, localBusinessSchema } from '@/lib/seo/jsonld';

export const metadata: Metadata = publicMetadata({
  title: 'Contact us',
  description: `Reach the ${SITE.publisher} office in ${SITE.city} — address, telephone, WhatsApp and email for booking or asking about an advertisement.`,
  path: '/contact',
});

/**
 * How to reach the office.
 *
 * Every detail comes from `app_settings`, falling back to `config/site.ts`,
 * so this page and the footer cannot disagree — and changing the office
 * telephone number remains an UPDATE rather than a deployment.
 *
 * Two things are deliberately absent. There are no opening hours, because
 * nobody has told me what they are. And there is no contact form: one would
 * need somewhere to deliver to, and notifications are a later phase — a form
 * that silently goes nowhere is worse than a telephone number that works.
 */
export default async function ContactPage() {
  /*
   * LocalBusiness data, from the same settings the page itself shows. No
   * opening hours and no coordinates: neither is recorded anywhere, and a
   * guessed latitude puts a pin on somebody else's shop.
   */
  const office = await getOfficeDetails();

  return (
    <Container className="py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-3xl font-semibold sm:text-4xl">Contact us</h1>
        <p className="mt-2 max-w-2xl text-[0.9375rem] text-fg-muted">
          {SITE.publisher} is in {SITE.city}. Call in, telephone, or send us a message.
        </p>

        <div className="mt-10 grid items-start gap-6 md:grid-cols-2">
          <OfficeContact heading="The office" />

          <div className="space-y-6">
            <section className="rounded-md border border-line bg-surface p-5 sm:p-6">
              <h2 className="font-serif text-xl font-semibold">Booking an advertisement</h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-muted">
                You can write and send a classified advertisement yourself, at any hour, without
                telephoning anybody. Display advertisements — the designed blocks with your own
                artwork — are quoted by our advertising team.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button href="/post-ad">Post an advertisement</Button>
                <Button href="/advertise" variant="secondary">
                  What we offer
                </Button>
              </div>
            </section>

            <section className="rounded-md border border-line bg-surface p-5 sm:p-6">
              <h2 className="font-serif text-xl font-semibold">
                About an advertisement you have booked
              </h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-muted">
                Its status, its dates and its whole history are on{' '}
                <Link href="/my-ads" className="font-medium text-primary hover:underline">
                  your advertisements
                </Link>{' '}
                page. If you telephone us about one, please have its reference to hand — it begins
                with <span className="font-medium tabular-nums">SC-</span> and is on the
                confirmation you were shown when you sent it.
              </p>
            </section>

            <section className="rounded-md border border-line bg-surface p-5 sm:p-6">
              <h2 className="font-serif text-xl font-semibold">Reporting an advertisement</h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-muted">
                Every published advertisement carries a Report control. It reaches our office
                directly and you do not need an account to use it.
              </p>
            </section>
          </div>
        </div>
      </div>

      <JsonLd data={localBusinessSchema(office)} />
    </Container>
  );
}
