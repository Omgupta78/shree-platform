import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalList, LegalPage, type LegalSection } from '@/components/site/legal-page';
import { SITE } from '@/config/site';
import { publicMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = publicMetadata({
  title: 'Terms & Conditions',
  description: `The terms on which ${SITE.name} accepts and publishes advertisements — moderation, expiry, renewal, packages and payment.`,
  path: '/terms',
});

/**
 * The terms, describing the system that exists.
 *
 * Every rule stated here is one the application actually enforces: the
 * thirty-day run and the two free advertisements a month come from
 * `app_settings`; the moderation states come from the transition table; the
 * fact that paying does not publish comes from the guard that refuses to
 * approve an unpaid renewal. Nothing describes a rule the code does not have.
 *
 * Refunds, governing law, the minimum age and the legal form of the business
 * are business decisions. They are in `config/legal.ts` as open questions and
 * render on the page as such.
 */
export default function TermsPage() {
  const sections: LegalSection[] = [
    {
      id: 'agreement',
      heading: 'These terms',
      body: (
        <>
          <p>
            {SITE.name} is published by {SITE.publisher} of {SITE.address}. Using this
            website — browsing it, holding an account, or placing an advertisement — means
            these terms apply to you.
          </p>
          <p>
            Please also read the{' '}
            <Link href="/privacy" className="text-primary underline underline-offset-2">
              Privacy Policy
            </Link>{' '}
            and the{' '}
            <Link href="/disclaimer" className="text-primary underline underline-offset-2">
              Disclaimer
            </Link>
            . The Disclaimer matters particularly: advertisements here are written by the
            people who place them, not by us.
          </p>
        </>
      ),
    },
    {
      id: 'accounts',
      heading: 'Accounts',
      body: (
        <>
          <p>
            Browsing needs no account. Placing an advertisement does. An account needs a name
            and an email address; a telephone number is optional.
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>The details you give must be your own and must be accurate.</li>
            <li>
              You are responsible for what happens under your account. Keep your password to
              yourself, and tell the office if you think somebody else has it.
            </li>
            <li>One account per person. Accounts are not transferable.</li>
            <li>
              An advertisement belongs to the account that placed it and cannot be moved to
              another — the database refuses it.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'posting',
      heading: 'Placing an advertisement',
      body: (
        <>
          <p>
            You write the advertisement. You choose its section, its place, its price, the
            contact details on it and which of those are shown publicly.
          </p>
          <LegalList
            items={[
              { term: 'What is required', detail: 'A title, a description, a section, a place, a contact name and a contact telephone number.' },
              { term: 'Photographs', detail: `Up to ${8} images, depending on the package. Each must be a JPEG, PNG or WebP of no more than 5 MB, and the file's actual contents are checked, not merely its name.` },
              { term: 'Free advertisements', detail: 'The office allows a number of free advertisements per account each month. The current allowance is two.' },
              { term: 'A saved draft', detail: 'A part-written advertisement is kept in your own browser so you do not lose it. It is not submitted until you send it.' },
            ]}
          />
          <p>
            You confirm that you have the right to place what you are placing, and that you
            own or may use any photograph you upload.
          </p>
        </>
      ),
    },
    {
      id: 'responsibility',
      heading: 'Your advertisement is yours',
      body: (
        <>
          <p>
            You are responsible for everything in your advertisement: that it is accurate, that
            it is lawful, that the goods or services exist and are yours to offer, and that you
            can honour what you have advertised.
          </p>
          <p>
            {SITE.name} publishes advertisements. It is not a party to any transaction that
            follows one, does not verify what an advertisement claims, and does not check that
            an advertiser is who they say they are. See the{' '}
            <Link href="/disclaimer" className="text-primary underline underline-offset-2">
              Disclaimer
            </Link>
            .
          </p>
        </>
      ),
    },
    {
      id: 'prohibited',
      heading: 'What may not be advertised',
      body: (
        <>
          <p>An advertisement will be refused, and may cost you your account, if it:</p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>offers anything unlawful, or anything whose sale requires a licence you do not hold;</li>
            <li>is fraudulent, deliberately misleading, or advertises something that does not exist;</li>
            <li>infringes somebody else&rsquo;s trade mark, copyright or other right;</li>
            <li>is obscene, defamatory, or incites hatred or violence;</li>
            <li>
              contains another person&rsquo;s private information — their telephone number,
              address or photograph — without their consent;
            </li>
            <li>is a duplicate of one already placed, or is posted repeatedly to gain prominence;</li>
            <li>
              advertises something plainly outside what this publication carries, or is placed
              in a section it does not belong in;
            </li>
            <li>
              attempts to interfere with the site — injected code, automated submission, or
              probing for weaknesses.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'moderation',
      heading: 'Review before publication',
      body: (
        <>
          <p className="rounded-sm border border-line bg-surface-sunken px-4 py-3">
            <span className="font-medium">
              Every advertisement is read by a member of staff before it appears.
            </span>{' '}
            Nothing is published automatically, and paying does not publish an advertisement —
            a paid advertisement still waits its turn in the queue.
          </p>
          <p>After it is reviewed, an advertisement is one of:</p>
          <LegalList
            items={[
              { term: 'Approved', detail: 'Published, and visible to the public from that moment.' },
              { term: 'Changes requested', detail: 'Sent back with a note saying what needs altering. Correct it and send it again.' },
              { term: 'Rejected', detail: 'Refused, with a reason. It cannot be approved without being resubmitted.' },
            ]}
          />
          <p>
            The office decides what it publishes and may refuse or withdraw an advertisement.
            Staff may correct the wording of an advertisement — spelling, a section it was
            filed in wrongly — but not its facts: a price or a telephone number is yours to
            change, and any correction staff make is recorded.
          </p>
        </>
      ),
    },
    {
      id: 'lifetime',
      heading: 'How long an advertisement runs',
      body: (
        <>
          <p>
            A published advertisement runs for a set period — currently 30 days — after which
            it expires and stops appearing in listings and search.
          </p>
          <p>
            An expired advertisement keeps its web address and shows a page saying it has
            ended, with current advertisements alongside it. That is deliberate: the address
            may have been printed, or sent to somebody. Search engines are asked not to list
            it.
          </p>
          <p>The office may end an advertisement early, with the reason recorded.</p>
        </>
      ),
    },
    {
      id: 'renewal',
      heading: 'Renewal',
      body: (
        <>
          <p>
            An advertisement can be put up for renewal, before or after it expires. Renewal is
            a request, not an automatic restart:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>A renewal is reviewed by staff, exactly as a new advertisement is.</li>
            <li>
              If the package carries a price, the renewal cannot be approved until it is paid.
              The database refuses it.
            </li>
            <li>Only one renewal request may be outstanding for an advertisement at a time.</li>
            <li>An approved renewal starts a fresh run of the same length.</li>
          </ul>
          <p>Nothing renews by itself, and nothing is charged to you automatically.</p>
        </>
      ),
    },
    {
      id: 'packages',
      heading: 'Packages and prices',
      body: (
        <>
          <p>
            Advertisements are placed against a package, which decides how many photographs are
            allowed and how prominently it appears. The packages and their prices are shown
            when you place an advertisement.
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              The price charged is the price held by the office at the moment the order is
              raised. It is never taken from anything your browser sends.
            </li>
            <li>
              Changing a package price later does not change a payment already made. Your
              receipt shows what you were actually charged.
            </li>
            <li>A package may be withdrawn; an advertisement already running on it is unaffected.</li>
            <li>
              Where a package carries no price, no payment is taken and the advertisement goes
              to the review queue directly.
            </li>
          </ul>
          <p>
            &ldquo;Featured placement&rdquo; and consideration for the printed edition mean the
            advertisement is eligible to be chosen. They are not a guarantee that it will be.
          </p>
        </>
      ),
    },
    {
      id: 'payment',
      heading: 'Payment',
      body: (
        <>
          <p>
            Payments are taken through Razorpay. Your card, UPI or bank details go to Razorpay
            and never to this website.
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              A payment is only treated as made once it is verified on our server against the
              payment provider&rsquo;s signature. A browser saying a payment succeeded is not
              enough.
            </li>
            <li>
              A failed or abandoned payment leaves the advertisement unpaid and unpublished.
              You can try again.
            </li>
            <li>
              Paying does not publish an advertisement. It still goes to the review queue, and
              it may still be refused.
            </li>
            <li>Your payment history is on your dashboard.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'refunds',
      heading: 'Refunds and cancellation',
      body: (
        <>
          <p>
            The website issues no refund automatically. A refund can only be recorded by the
            office, and every such change is written to a record that cannot afterwards be
            edited.
          </p>
          <p>
            The circumstances in which the office gives a refund have not yet been settled. Until
            they are, a refund is a matter to raise with the office directly, using the details
            at the foot of this page. This is set out in the box at the top of this page rather
            than left to be discovered.
          </p>
        </>
      ),
    },
    {
      id: 'suspension',
      heading: 'Suspension and closing an account',
      body: (
        <>
          <p>
            The office may block an account that breaks these terms. A blocked account cannot
            place or change advertisements, and its advertisements may be withdrawn. Where a
            blocked account holds a paid advertisement, what happens to that payment falls under
            the refund question above.
          </p>
          <p>
            You may close your account at any time by writing to the office. What is removed is
            described in the{' '}
            <Link href="/privacy" className="text-primary underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
        </>
      ),
    },
    {
      id: 'intellectual-property',
      heading: 'Intellectual property',
      body: (
        <>
          <p>
            The {SITE.name} name, the design of this website and its contents belong to{' '}
            {SITE.publisher}. They may not be copied or reused without permission.
          </p>
          <p>
            What you write and upload stays yours. By placing an advertisement you permit{' '}
            {SITE.publisher} to publish it, on this website and in the printed edition, and to
            keep showing it for as long as the advertisement runs. Photographs may be resized
            and cropped to fit the layout.
          </p>
        </>
      ),
    },
    {
      id: 'third-parties',
      heading: 'Other services and links',
      body: (
        <p>
          The site relies on outside services — Supabase, Razorpay, and the email and WhatsApp
          providers — each with its own terms, listed in the{' '}
          <Link href="/privacy" className="text-primary underline underline-offset-2">
            Privacy Policy
          </Link>
          . An advertisement may link somewhere else. {SITE.name} does not control those places
          and is not responsible for them.
        </p>
      ),
    },
    {
      id: 'availability',
      heading: 'Availability and changes to the service',
      body: (
        <p>
          The site is offered as it is. It is not promised to be uninterrupted or free of
          faults, and it may be unavailable for maintenance or for reasons outside the
          office&rsquo;s control. Sections, packages, prices and features may change or be
          withdrawn. Where a change affects an advertisement already running, the office will
          try to give notice.
        </p>
      ),
    },
    {
      id: 'liability',
      heading: 'Limitation of liability',
      body: (
        <>
          <p>
            {SITE.publisher} publishes advertisements. It is not a party to any dealing between
            an advertiser and a reader, and it does not verify advertisements or advertisers.
          </p>
          <p>
            So far as the law permits, {SITE.publisher} is not liable for loss arising from an
            advertisement, from dealings that follow one, from the site being unavailable, or
            from anything an advertiser does or fails to do.
          </p>
          <p>
            Nothing here limits liability that cannot lawfully be limited. Your statutory
            rights are unaffected.
          </p>
        </>
      ),
    },
    {
      id: 'governing-law',
      heading: 'Governing law',
      body: (
        <p>
          The law that governs these terms and the courts that would hear a dispute have not
          yet been settled by the office. This is listed in the box at the top of this page.
          Until it is decided, this section deliberately states nothing, because naming a
          jurisdiction that has not been chosen would be worse than leaving it open.
        </p>
      ),
    },
    {
      id: 'changes',
      heading: 'Changes to these terms',
      body: (
        <p>
          These terms may change. The date at the top of this page changes with them, and
          continuing to use the site afterwards means the current version applies. If a change
          matters to advertisements already running, the office will try to give notice.
        </p>
      ),
    },
    {
      id: 'contact',
      heading: 'Contacting the office',
      body: (
        <LegalList
          items={[
            { term: 'Post', detail: `${SITE.publisher}, ${SITE.address}` },
            {
              term: 'Email',
              detail: (
                <a href={`mailto:${SITE.email}`} className="text-primary underline underline-offset-2">
                  {SITE.email}
                </a>
              ),
            },
            { term: 'Telephone', detail: SITE.phones.map((phone) => `+91 ${phone}`).join(' · ') },
          ]}
        />
      ),
    },
  ];

  return (
    <LegalPage
      page="terms"
      title="Terms & Conditions"
      intro={`The terms on which ${SITE.name} accepts, reviews and publishes advertisements.`}
      sections={sections}
    />
  );
}
