import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalList, LegalPage, type LegalSection } from '@/components/site/legal-page';
import { SITE } from '@/config/site';
import { publicMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = publicMetadata({
  title: 'Privacy Policy',
  description: `What ${SITE.name} collects, why, where it is stored and who it is shared with — written from what the site actually does.`,
  path: '/privacy',
});

/**
 * What the site collects, and what it does not.
 *
 * Every claim here was checked against the code before it was written: the
 * columns in `profiles` and `ads`, what `payments` stores and what it
 * deliberately does not, which providers are integrated, what goes into
 * `localStorage`, and which retention periods are actually enforced by a
 * scheduled job rather than merely intended.
 *
 * Nothing says "completely secure" or "fully protected". The measures that
 * exist are described; no promise is made about their outcome.
 */
export default function PrivacyPage() {
  const sections: LegalSection[] = [
    {
      id: 'scope',
      heading: 'Who this applies to',
      body: (
        <>
          <p>
            This policy covers the {SITE.name} website, published by {SITE.publisher} from{' '}
            {SITE.address}. It describes what the website collects, why, where it is kept and
            who else sees it.
          </p>
          <p>
            It covers the website only. An advertisement also appears in the printed edition,
            and once something is printed it cannot be recalled or amended.
          </p>
        </>
      ),
    },
    {
      id: 'account',
      heading: 'Account information',
      body: (
        <>
          <p>When an account is created, the site stores:</p>
          <LegalList
            items={[
              { term: 'Name', detail: 'Required. Used to address you and shown to staff reviewing your advertisements.' },
              { term: 'Email address', detail: 'Required. Used to sign in, to confirm the account, to reset a password, and to send the notifications you have not switched off.' },
              { term: 'Telephone number', detail: 'Optional. Stored only if you give it.' },
              {
                term: 'Password',
                detail:
                  'Handled entirely by Supabase Auth, our authentication provider. It is not stored by this website in any form, and nobody at the office can read it.',
              },
            ]}
          />
          <p>
            Your account details are readable only by you and by {SITE.name} staff. The
            database enforces this itself, with row-level security, rather than relying on the
            website to remember to ask.
          </p>
        </>
      ),
    },
    {
      id: 'advertisements',
      heading: 'Advertisement information',
      body: (
        <>
          <p>
            An advertisement is, by its nature, meant to be published. What you type into it is
            intended to be read by the public once it is approved.
          </p>
          <LegalList
            items={[
              { term: 'The advertisement itself', detail: 'Title, description, price, category, location and any category-specific details you fill in.' },
              {
                term: 'Contact details on the advertisement',
                detail:
                  'A contact name and telephone number are required. A WhatsApp number and an email address are optional. These are separate from your account details — you can advertise under a different number from the one on your account.',
              },
              {
                term: 'What is shown publicly',
                detail:
                  'You choose. The posting form has switches for showing your telephone number and your WhatsApp number, and the database only releases a number to the public view when the matching switch is on. A number you keep private stays visible to you and to staff.',
              },
              {
                term: 'Photographs',
                detail:
                  'Images you upload are stored in Supabase Storage. Photographs attached to a classified advertisement are in a publicly readable bucket, because they are shown on a public page. Artwork for display advertising is in a private bucket readable only by you and staff.',
              },
            ]}
          />
          <p>
            Every advertisement is read by a member of staff before it is published. Staff can
            see the whole advertisement, including any contact details you chose to keep off
            the public page.
          </p>
        </>
      ),
    },
    {
      id: 'payments',
      heading: 'Payments',
      body: (
        <>
          <p>
            Where an advertisement package is priced, payment is taken through{' '}
            <a
              href="https://razorpay.com"
              className="text-primary underline underline-offset-2"
              rel="noopener noreferrer"
              target="_blank"
            >
              Razorpay
            </a>
            , an Indian payment gateway.
          </p>
          <p className="rounded-sm border border-line bg-surface-sunken px-4 py-3">
            <span className="font-medium">
              This website never receives or stores your card, UPI or bank details.
            </span>{' '}
            They are entered into Razorpay&rsquo;s own checkout and handled by Razorpay under
            their privacy policy and their obligations as a payment provider.
          </p>
          <p>What this site keeps against a payment is:</p>
          <LegalList
            items={[
              { term: 'The amount and currency', detail: 'Taken from our own package prices, never from anything your browser sends.' },
              { term: 'Status', detail: 'Whether the payment was created, paid, failed, cancelled or refunded.' },
              { term: 'Razorpay reference numbers', detail: 'The order and payment identifiers, so a payment can be traced if it is queried.' },
              { term: 'A reason, if it failed', detail: 'The provider&rsquo;s description of the failure.' },
              { term: 'The date it was settled', detail: 'Used for your receipt and for the office&rsquo;s accounts.' },
            ]}
          />
        </>
      ),
    },
    {
      id: 'notifications',
      heading: 'Notifications, email and WhatsApp',
      body: (
        <>
          <p>
            The site tells you when something happens to your advertisement — it is published,
            it is sent back for a change, it is about to expire, a payment is settled.
          </p>
          <LegalList
            items={[
              { term: 'In the site', detail: 'Always. These are records in your own account and nobody else can read them.' },
              {
                term: 'By email',
                detail:
                  'On by default, and switchable per category of message in your notification settings. Email is delivered by Resend, which receives your address and the message.',
              },
              {
                term: 'By WhatsApp',
                detail:
                  'Off by default for everybody. It is only ever sent if you switch it on, and only through Meta&rsquo;s WhatsApp Business platform using a message template approved in advance. Switching it on shares your number with Meta for that purpose.',
              },
            ]}
          />
          <p>
            These are service messages about your own advertisements. The site does not send
            marketing, and there is no mailing list.
          </p>
        </>
      ),
    },
    {
      id: 'analytics',
      heading: 'How the site measures itself',
      body: (
        <>
          <p className="rounded-sm border border-line bg-surface-sunken px-4 py-3">
            <span className="font-medium">
              There is no Google Analytics, no advertising pixel and no third-party tracker of
              any kind on this website.
            </span>{' '}
            Nothing follows you to another site, and nothing builds a profile of you.
          </p>
          <p>What the office does count, in its own database:</p>
          <LegalList
            items={[
              {
                term: 'Views of an advertisement',
                detail:
                  'A single running total per advertisement, so an advertiser can see how many times theirs has been opened. It is a counter, not a list — no record is kept of who opened it or when.',
              },
              {
                term: 'Search terms',
                detail:
                  'The words typed into the search box, the number of results they found, and the section searched. No account, no address and no session identifier is stored with them — the table has no column for any of those, so a search cannot be traced back to a person even by us. These are deleted after 90 days.',
              },
              {
                term: 'Totals and counts',
                detail:
                  'How many advertisements were submitted, approved and published; how many payments settled; how long the review queue is. These are aggregates computed from the records already described.',
              },
            ]}
          />
        </>
      ),
    },
    {
      id: 'cookies',
      heading: 'Cookies and what is kept on your device',
      body: (
        <>
          <p>The site uses two things, and neither is for advertising.</p>
          <LegalList
            items={[
              {
                term: 'Session cookies',
                detail:
                  'Set by Supabase Auth when you sign in, so the site knows it is still you as you move between pages. Without them you could not stay signed in. They are removed when you sign out.',
              },
              {
                term: 'A saved draft',
                detail:
                  'While you are writing an advertisement, what you have typed so far is kept in your own browser&rsquo;s local storage so a closed tab does not lose your work. It never leaves your device until you submit, and it is cleared when you do.',
              },
            ]}
          />
        </>
      ),
    },
    {
      id: 'where',
      heading: 'Where the information is kept, and who else has it',
      body: (
        <>
          <p>
            The database and the uploaded files are held with{' '}
            <a
              href="https://supabase.com"
              className="text-primary underline underline-offset-2"
              rel="noopener noreferrer"
              target="_blank"
            >
              Supabase
            </a>
            , which also provides the sign-in system. The website itself is hosted by a
            third-party hosting provider.
          </p>
          <p>The complete list of outside services that receive anything:</p>
          <LegalList
            items={[
              { term: 'Supabase', detail: 'Database, sign-in and file storage. Holds everything described above.' },
              { term: 'Razorpay', detail: 'Payments. Receives what is needed to take a payment; gives us back a reference and a status. Only if a package is priced and you choose to pay.' },
              { term: 'Resend', detail: 'Email delivery. Receives your email address and the message. Only if email notifications are switched on and the office has configured a provider.' },
              { term: 'Meta (WhatsApp Business)', detail: 'WhatsApp messages. Receives your number and the message. Only if you switch WhatsApp on, which is off by default.' },
              { term: 'The hosting provider', detail: 'Serves the website and keeps server logs, as any host does.' },
            ]}
          />
          <p>
            Nothing is sold. Nothing is shared with an advertiser, a data broker or an
            advertising network. Information is disclosed outside this list only where the law
            requires it.
          </p>
        </>
      ),
    },
    {
      id: 'security',
      heading: 'How the information is protected',
      body: (
        <>
          <p>
            The measures actually in place, described so you can judge them rather than take a
            reassurance on trust:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              The database enforces who may read what, in the database itself, on every table.
              A fault in the website cannot expose another person&rsquo;s records, because the
              database would refuse the query.
            </li>
            <li>
              Contact details are released to the public view only where you switched them on.
            </li>
            <li>
              Uploaded files are owned by the account that uploaded them and cannot be
              overwritten by anyone else.
            </li>
            <li>
              Payments are verified by cryptographic signature on our server. The amount is
              read from our own prices, never from your browser.
            </li>
            <li>The site is served over HTTPS, with standard browser security headers.</li>
            <li>
              Sign-in, sign-up and password-reset attempts are rate limited, and the counters
              are keyed on a one-way hash so no address is stored.
            </li>
            <li>
              Staff actions — approving, rejecting, changing a price — are written to an
              append-only record that nobody, including an administrator, can edit or delete.
            </li>
          </ul>
          <p>
            No website can promise that information will never be exposed, and this one does
            not. If we discover a breach affecting your information, we will tell you.
          </p>
        </>
      ),
    },
    {
      id: 'retention',
      heading: 'How long things are kept',
      body: (
        <>
          <p>Two periods are settled and are enforced automatically:</p>
          <LegalList
            items={[
              { term: 'Search terms', detail: 'Deleted after 90 days, by a job that runs daily.' },
              { term: 'Rate-limiting counters', detail: 'Deleted an hour after they are written.' },
            ]}
          />
          <p>
            Everything else — your account, your advertisements and your payment records — is
            kept until it is deleted. An expired advertisement keeps its page, marked as
            expired and asking search engines not to list it, because its address may have been
            printed or shared.
          </p>
        </>
      ),
    },
    {
      id: 'rights',
      heading: 'Your information, and what you can do with it',
      body: (
        <>
          <p>Within the website, as it stands today, you can:</p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>See everything on your account, on your own dashboard.</li>
            <li>Correct your own advertisements, within the limits described in the Terms.</li>
            <li>Delete your own advertisements.</li>
            <li>Choose which contact details appear publicly, before and after publication.</li>
            <li>Switch each category of email and WhatsApp notification on or off.</li>
            <li>See your own payment history.</li>
          </ul>
          <p>
            There is no button that deletes an account. To close one, write to the office at{' '}
            <a
              href={`mailto:${SITE.email}`}
              className="text-primary underline underline-offset-2"
            >
              {SITE.email}
            </a>{' '}
            from the address on the account. Removing an account removes its advertisements,
            photographs, payments, notifications and saved items with it. The record of staff
            decisions survives deliberately — a log of who approved what would be worthless if
            it could be erased — but it identifies the member of staff who acted, not you.
          </p>
        </>
      ),
    },
    {
      id: 'children',
      heading: "Children's information",
      body: (
        <p>
          This is a service for people placing and reading commercial advertisements. It is not
          directed at children and does not knowingly collect information from them. If you
          believe a child has given us information, write to the office and it will be removed.
        </p>
      ),
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      body: (
        <p>
          This policy will change as the site does. When it does, the date at the top of this
          page changes with it. Continuing to use the site after a change means the current
          version applies to you. There is no archive of previous versions.
        </p>
      ),
    },
    {
      id: 'contact',
      heading: 'Asking us about this',
      body: (
        <>
          <p>
            Questions about this policy, or about information the site holds about you, go to
            the office:
          </p>
          <LegalList
            items={[
              { term: 'Post', detail: `${SITE.publisher}, ${SITE.address}` },
              {
                term: 'Email',
                detail: (
                  <a
                    href={`mailto:${SITE.email}`}
                    className="text-primary underline underline-offset-2"
                  >
                    {SITE.email}
                  </a>
                ),
              },
              {
                term: 'Telephone',
                detail: SITE.phones.map((phone) => `+91 ${phone}`).join(' · '),
              },
            ]}
          />
          <p>
            The <Link href="/contact" className="text-primary underline underline-offset-2">contact page</Link>{' '}
            has the same details.
          </p>
        </>
      ),
    },
  ];

  return (
    <LegalPage
      page="privacy"
      title="Privacy Policy"
      intro={`What ${SITE.name} collects, why it is collected, where it is kept and who else sees it.`}
      sections={sections}
    />
  );
}
