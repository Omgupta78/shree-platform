import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage, type LegalSection } from '@/components/site/legal-page';
import { SITE } from '@/config/site';
import { publicMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = publicMetadata({
  title: 'Disclaimer',
  description: `Advertisements on ${SITE.name} are written by the people who place them. What that means for readers, and what to check before you act on one.`,
  path: '/disclaimer',
});

/**
 * The reader's disclaimer.
 *
 * The printed edition already carries one, word for word, in
 * `config/site.ts` as `readerDisclaimer`. This page opens with that exact
 * sentence rather than a rewritten version, so the paper and the website say
 * the same thing — a difference between the two is the sort of inconsistency
 * that gets noticed only in a dispute.
 *
 * The rest describes the checks that genuinely exist and is careful not to
 * overstate them. Staff read every advertisement; they do not verify that its
 * claims are true, and this page says exactly that.
 */
export default function DisclaimerPage() {
  const sections: LegalSection[] = [
    {
      id: 'user-submitted',
      heading: 'Advertisements are written by advertisers',
      body: (
        <>
          <p className="rounded-sm border border-line bg-surface-sunken px-4 py-3 text-[0.9375rem]">
            {SITE.readerDisclaimer}
          </p>
          <p>
            That is the notice printed on every classified page of the paper, and it applies
            equally here. Every advertisement on this website was written and submitted by the
            person or business placing it. The description, the price, the photographs and the
            contact details are theirs.
          </p>
          <p>
            {SITE.publisher} publishes advertisements. It is not the seller, not the employer,
            not the landlord and not an agent for any advertiser.
          </p>
        </>
      ),
    },
    {
      id: 'what-review-means',
      heading: 'What our review does, and what it does not',
      body: (
        <>
          <p>
            Every advertisement is read by a member of staff before it is published. It is
            worth being precise about what that means.
          </p>
          <p className="font-medium">Review checks that an advertisement:</p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>is in the right section and is the sort of thing this publication carries;</li>
            <li>is legible, and not obviously fraudulent, obscene or unlawful on its face;</li>
            <li>is not a duplicate of one already running.</li>
          </ul>
          <p className="mt-4 font-medium">Review does not check that:</p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>the advertiser is who they say they are;</li>
            <li>the item or property exists, or is theirs to sell or let;</li>
            <li>the price, the specification, the condition or the mileage is accurate;</li>
            <li>a vacancy is real, or that an employer will pay what is offered;</li>
            <li>a qualification, a licence or a registration that is claimed is genuine;</li>
            <li>photographs show the thing being advertised.</li>
          </ul>
          <p>
            None of that is within an advertisement publisher&rsquo;s power to establish. An
            advertisement appearing here is not an endorsement, a recommendation or a
            verification of it.
          </p>
        </>
      ),
    },
    {
      id: 'verify',
      heading: 'Satisfy yourself before you act',
      body: (
        <>
          <p>
            Before you pay anybody, travel to meet them, or hand over a document, check for
            yourself. Reasonable precautions include:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              seeing the goods or the property in person, and satisfying yourself they are as
              described;
            </li>
            <li>
              checking the paperwork — ownership, registration, agreements — against the person
              offering it;
            </li>
            <li>meeting somewhere public, and taking somebody with you where that is sensible;</li>
            <li>
              being wary of any request for money in advance, particularly a deposit or fee
              before you have seen anything;
            </li>
            <li>
              being wary of an offer well below what the thing is worth, and of pressure to
              decide quickly;
            </li>
            <li>
              taking professional advice — a solicitor, a surveyor, a mechanic — where the sum
              justifies it.
            </li>
          </ul>
          <p>
            No advertisement on this website has been checked against any of these. Where a
            transaction needs verification, verification is yours to do.
          </p>
        </>
      ),
    },
    {
      id: 'transactions',
      heading: 'Dealings between advertisers and readers',
      body: (
        <>
          <p>
            Any arrangement you reach with an advertiser is between the two of you.{' '}
            {SITE.publisher} is not a party to it, takes no commission on it, holds no money
            for it and gives no guarantee about it.
          </p>
          <p>
            Payments made to {SITE.name} are for placing an advertisement and nothing else.
            They are not payment for goods, and they do not insure, escrow or guarantee any
            transaction that follows from an advertisement.
          </p>
          <p>
            If a dealing goes wrong, the office cannot recover your money or compel an
            advertiser to act. Report the advertisement so it can be reviewed, and take the
            matter up with the advertiser, with your bank, or with the police as the
            circumstances warrant.
          </p>
        </>
      ),
    },
    {
      id: 'reporting',
      heading: 'Reporting an advertisement',
      body: (
        <>
          <p>
            Every published advertisement carries a link to report it. Use it if something
            looks fraudulent, misleading or otherwise wrong. Reports go to the office and are
            reviewed.
          </p>
          <p>
            Reviewing takes time, and an advertisement stays visible until it is dealt with.
            Reporting is not an instant removal, and the office may conclude that an
            advertisement is acceptable. Something urgent is better raised by telephone —{' '}
            {SITE.phones.map((phone) => `+91 ${phone}`).join(' or ')}.
          </p>
        </>
      ),
    },
    {
      id: 'accuracy',
      heading: 'The site itself',
      body: (
        <>
          <p>
            The office tries to keep the site&rsquo;s own pages accurate — sections, packages,
            office details, the printed schedule — but does not guarantee them, and they may
            be out of date. Where the site and the printed edition disagree, ask the office.
          </p>
          <p>
            View counts and similar figures shown to advertisers are an indication, not an
            audited measurement.
          </p>
          <p>
            The site is offered as it is. It is not promised to be uninterrupted or free of
            faults.
          </p>
        </>
      ),
    },
    {
      id: 'external',
      heading: 'Links and outside services',
      body: (
        <p>
          An advertisement may link elsewhere, and the site relies on outside services —
          Supabase, Razorpay, and the email and WhatsApp providers, listed in the{' '}
          <Link href="/privacy" className="text-primary underline underline-offset-2">
            Privacy Policy
          </Link>
          . {SITE.publisher} does not control those places or services, does not endorse them,
          and is not responsible for their content or their availability.
        </p>
      ),
    },
    {
      id: 'no-advice',
      heading: 'Nothing here is professional advice',
      body: (
        <p>
          Nothing on this website — in an advertisement or on the site&rsquo;s own pages — is
          legal, financial, medical, employment or property advice. Where a decision needs
          professional advice, take it from somebody qualified to give it.
        </p>
      ),
    },
    {
      id: 'liability',
      heading: 'Limitation',
      body: (
        <>
          <p>
            So far as the law permits, {SITE.publisher} is not liable for loss or damage
            arising from an advertisement published here, from a dealing that follows one, from
            reliance on anything on this site, or from the site being unavailable.
          </p>
          <p>
            Nothing here limits liability that cannot lawfully be limited, and your statutory
            rights as a consumer are unaffected. This page should be read with the{' '}
            <Link href="/terms" className="text-primary underline underline-offset-2">
              Terms &amp; Conditions
            </Link>
            .
          </p>
        </>
      ),
    },
    {
      id: 'contact',
      heading: 'Raising something with the office',
      body: (
        <p>
          Anything on this page, or an advertisement you are concerned about:{' '}
          <a href={`mailto:${SITE.email}`} className="text-primary underline underline-offset-2">
            {SITE.email}
          </a>
          , {SITE.phones.map((phone) => `+91 ${phone}`).join(' or ')}, or{' '}
          {SITE.publisher}, {SITE.address}. The{' '}
          <Link href="/contact" className="text-primary underline underline-offset-2">
            contact page
          </Link>{' '}
          has the same details.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      page="disclaimer"
      title="Disclaimer"
      intro="Advertisements here are written by the people who place them. What that means for you as a reader, and what to check before acting on one."
      sections={sections}
    />
  );
}
