'use client';

import { Button } from '@/components/ui/button';
import { CheckIcon } from '@/components/ui/icons';
import { AD_TYPE_BY_ID } from '@/config/ad-types';
import { SITE } from '@/config/site';
import { isDemoReference } from '@/lib/post-ad/submit';
import type { SubmissionResult } from '@/types/submission';

/**
 * The confirmation.
 *
 * Careful about what it promises. The advertisement has been *received*, not
 * published; the reference is marked as a demonstration one; and there is no
 * claim about when it will appear, because nobody has told me what the
 * office's turnaround actually is.
 */
export function SubmissionSuccess({
  result,
  onPostAnother,
}: {
  result: SubmissionResult;
  onPostAnother: () => void;
}) {
  const type = AD_TYPE_BY_ID.get(result.advertisementType);

  return (
    <div data-submitted className="mx-auto max-w-xl py-10 text-center sm:py-16">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-positive-surface text-positive-fg">
        <CheckIcon size={30} />
      </span>

      <h1 className="mt-6 font-serif text-3xl font-semibold">
        Advertisement Submitted Successfully
      </h1>

      <p className="mt-3 text-[0.9375rem] leading-relaxed text-fg-muted">
        Your advertisement has been received and will be reviewed before publication.
      </p>

      {result.advertisementType === 'display' ? (
        <p className="mt-2 text-sm text-fg-muted">
          Our advertising team will be in touch to confirm the size, placement and rate.
        </p>
      ) : null}

      <div className="mt-8 rounded-md border border-line bg-surface p-5">
        <p className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
          Advertisement Reference
        </p>
        <p
          data-reference
          className="mt-2 font-serif text-2xl font-semibold tracking-wide tabular-nums"
        >
          {result.reference}
        </p>
        {type ? <p className="mt-2 text-sm text-fg-muted">{type.name}</p> : null}
      </div>

      {isDemoReference(result.reference) ? (
        <p className="mt-4 rounded-sm border border-accent-line bg-accent-surface p-3 text-left text-sm leading-relaxed text-accent-fg">
          <strong className="font-semibold">Demonstration only.</strong> Nothing has been sent and
          no advertisement has been created. This reference is generated in your browser; real
          references are issued by our office once the submission system is connected.
        </p>
      ) : null}

      <p className="mt-6 text-sm text-fg-muted">
        Any questions? Call our office on{' '}
        <a href={`tel:+91${SITE.phones[0]}`} className="font-medium text-primary hover:underline">
          {SITE.phones[0]}
        </a>
        .
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button href="/classifieds" variant="secondary" size="lg">
          Back to Classifieds
        </Button>
        <Button size="lg" data-nav="post-another" onClick={onPostAnother}>
          Post Another Advertisement
        </Button>
      </div>
    </div>
  );
}
