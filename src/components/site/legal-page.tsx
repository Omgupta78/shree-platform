import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '@/components/ui/container';
import {
  POLICY_EFFECTIVE_DATE,
  POLICY_PAGES,
  decisionsFor,
  type PendingDecision,
} from '@/config/legal';
import { SITE } from '@/config/site';

/**
 * The shell the three policy pages share.
 *
 * Same column width, same serif headings and same spacing as `/about` and
 * `/contact`, because these are ordinary pages of the site and should not
 * arrive looking like a document pasted in from elsewhere.
 *
 * Long prose with numbered sections is the one place on this site where a
 * table of contents earns itself: somebody arriving from a payment provider's
 * checklist is looking for one clause, and scrolling a policy on a telephone
 * to find it is the whole complaint people have about these pages.
 */

export interface LegalSection {
  /** Anchor, used by the table of contents. */
  id: string;
  heading: string;
  body: ReactNode;
}

export function LegalPage({
  title,
  intro,
  sections,
  page,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
  page: PendingDecision['page'];
}) {
  const pending = decisionsFor(page);

  return (
    <Container className="py-12">
      <article className="mx-auto max-w-3xl">
        <h1 className="font-serif text-3xl font-semibold sm:text-4xl">{title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-fg-muted">{intro}</p>

        <EffectiveDate />

        {pending.length > 0 ? (
          <section
            aria-labelledby="pending-decisions"
            className="mt-8 rounded-md border-2 border-dashed border-critical-line bg-critical-surface p-5"
          >
            <h2 id="pending-decisions" className="font-serif text-lg font-semibold">
              Not yet settled — {pending.length}{' '}
              {pending.length === 1 ? 'decision' : 'decisions'} for the office
            </h2>
            <p className="mt-2 text-sm text-fg-muted">
              This page is published with the questions below unanswered. Each one needs a
              decision from {SITE.publisher} rather than a plausible guess, so each is shown
              here instead of being filled in. They are listed again, with the same wording, in{' '}
              <code className="text-fg">src/config/legal.ts</code>.
            </p>
            <ol className="mt-4 space-y-4">
              {pending.map((decision) => (
                <li key={decision.id} id={`decision-${decision.id}`}>
                  <p className="text-[0.9375rem] font-medium">{decision.question}</p>
                  <p className="mt-1 text-sm text-fg-muted">
                    <span className="font-medium text-fg">What the site does today: </span>
                    {decision.whatTheCodeDoes}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {/*
          Hidden from assistive technology on purpose where it would only
          repeat the headings immediately below it — but it is a real <nav>
          with real links, because on a telephone it is the difference between
          finding a clause and giving up.
        */}
        <nav aria-labelledby="contents" className="mt-10 rounded-md border border-line bg-surface p-5">
          <h2 id="contents" className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
            Contents
          </h2>
          <ol className="mt-3 space-y-1.5 text-[0.9375rem]">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-primary hover:underline">
                  <span className="tabular-nums text-fg-subtle">{index + 1}.</span>{' '}
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
              <h2
                id={`${section.id}-heading`}
                className="font-serif text-2xl font-semibold"
              >
                <span className="text-fg-subtle tabular-nums">{index + 1}.</span>{' '}
                {section.heading}
              </h2>
              <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-14 border-t border-line pt-6">
          <h2 className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
            The other policies
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {POLICY_PAGES.filter((item) => !item.href.includes(page)).map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-block rounded-full border border-line-strong px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/contact"
                className="inline-block rounded-full border border-line-strong px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
              >
                Contact the office
              </Link>
            </li>
          </ul>
        </footer>
      </article>
    </Container>
  );
}

/**
 * When these policies took effect.
 *
 * Says plainly that no date is set rather than printing today's. A policy
 * carrying a date the business never approved it on is a false statement about
 * when it agreed to something, and it is the first thing a dispute turns on.
 */
function EffectiveDate() {
  if (!POLICY_EFFECTIVE_DATE) {
    return (
      <p className="mt-5 rounded-sm border border-line bg-surface-sunken px-4 py-3 text-sm text-fg-muted">
        <span className="font-medium text-fg">Last updated:</span> not yet set. These
        policies have no adoption date because {SITE.publisher} has not yet confirmed one.
      </p>
    );
  }

  return (
    <p className="mt-5 text-sm text-fg-muted">
      <span className="font-medium text-fg">Last updated:</span> {POLICY_EFFECTIVE_DATE}
    </p>
  );
}

/** A definition-style pair, used where a policy lists what is collected. */
export function LegalList({ items }: { items: Array<{ term: string; detail: ReactNode }> }) {
  return (
    <dl className="mt-3 space-y-3 rounded-md border border-line bg-surface p-5">
      {items.map((item) => (
        <div key={item.term}>
          <dt className="text-sm font-semibold">{item.term}</dt>
          <dd className="mt-0.5 text-[0.9375rem] text-fg-muted">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
