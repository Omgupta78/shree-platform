import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';

import { OfficeContact } from '@/components/site/office-contact';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { ADVERTISEMENT_TYPES } from '@/config/ad-types';
import { CATEGORIES, categoryHref } from '@/config/categories';
import { SITE } from '@/config/site';

export const metadata: Metadata = publicMetadata({
  title: 'About us',
  description: SITE.description,
  path: '/about',
});

/**
 * Who publishes this, and how it works.
 *
 * Every claim on this page is traceable: the business details come from
 * `app_settings` and `config/site.ts`, the two kinds of advertisement from
 * `config/ad-types.ts`, the sections from `config/categories.ts`, and the
 * steps below are the lifecycle the database actually enforces.
 *
 * What is NOT here, for the reason `config/site.ts` gives at the top of the
 * file: no founding year, no circulation figure, no readership claim, no
 * awards, and no promise about how quickly an advertisement is approved.
 * None of those facts has been given to me, and a business's own About page
 * is the last place that should contain a guess.
 */
export default function AboutPage() {
  return (
    <Container className="py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-3xl font-semibold sm:text-4xl">
          About {SITE.name}
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-fg-muted">{SITE.description}</p>

        <section className="mt-10">
          <h2 className="font-serif text-2xl font-semibold">In print, and online</h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed">
            {SITE.name} is published by {SITE.publisher} from {SITE.city}, {SITE.state}. The
            printed edition comes out every {SITE.publishDay}, carrying the same sections you see
            here. This site is the other half of it: an advertisement can be booked at any hour,
            and once approved it is readable straight away rather than waiting for the next
            edition.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl font-semibold">What you can book</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {ADVERTISEMENT_TYPES.map((type) => (
              <div key={type.id} className="rounded-md border border-line bg-surface p-5">
                <h3 className="font-serif text-lg font-semibold">{type.name}</h3>
                <p className="mt-1 text-sm text-fg-subtle">{type.tagline}</p>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-fg-muted">
                  {type.description}
                </p>
                <p className="mt-3 text-sm text-fg-subtle">{type.handling}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl font-semibold">The sections</h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-fg-muted">
            The same {CATEGORIES.length} sections that run in the paper each week.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link
                  href={categoryHref(category.slug)}
                  className="inline-flex rounded-xs border border-line bg-surface px-3 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl font-semibold">
            How an advertisement reaches the page
          </h2>
          {/*
            These four steps are the lifecycle the database enforces, not a
            description of good intentions: status begins at `pending` by
            trigger, `moderate_advertisement()` is what moves it, approval is
            what sets the run, and renewal goes back through the queue. There
            is deliberately no claim about how long review takes.
          */}
          <ol className="mt-4 space-y-4">
            {[
              {
                title: 'You write it',
                body: 'Eight short steps — what you are advertising, where, how to reach you, and photographs if you have them. Your answers are saved on your own device as you go, so nothing is lost if you stop halfway.',
              },
              {
                title: 'Somebody reads it',
                body: 'Every advertisement is read by our office before it appears. If something needs correcting we send it back with a note rather than refusing it outright.',
              },
              {
                title: 'It is published',
                body: 'Once approved it appears on the site and runs for the length its package carries. Readers see your contact details exactly as you chose to share them — a telephone number you asked us to withhold is never shown.',
              },
              {
                title: 'It finishes, and can be renewed',
                body: 'At the end of its run an advertisement stops appearing. Renewing sends it back through the same review, and the new run starts when it is approved.',
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-surface font-serif font-semibold text-primary tabular-nums"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-1 text-[0.9375rem] leading-relaxed text-fg-muted">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl font-semibold">Find us</h2>
          <div className="mt-4">
            <OfficeContact />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button href="/post-ad">Post an advertisement</Button>
            <Button href="/advertise" variant="secondary">
              Advertise your business
            </Button>
          </div>
        </section>
      </div>
    </Container>
  );
}
