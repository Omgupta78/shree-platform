import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '@/components/ui/container';
import { ArrowRightIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * Section heading with the rule beneath it that gives the page its newspaper
 * structure. Used by every homepage band so spacing and hierarchy stay
 * identical down the page.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  id,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  id?: string;
}) {
  return (
    <div className="border-b-2 border-fg pb-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1.5 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h2 id={id} className="text-2xl leading-tight font-semibold sm:text-[1.75rem]">
            {title}
          </h2>
        </div>

        {action ? (
          <Link
            href={action.href}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            {action.label}
            <ArrowRightIcon size={15} />
          </Link>
        ) : null}
      </div>

      {description ? (
        <p className="mt-2 max-w-2xl text-[0.9375rem] text-fg-muted">{description}</p>
      ) : null}
    </div>
  );
}

/** A full-width band with consistent vertical rhythm. */
export function Section({
  children,
  className,
  tone = 'canvas',
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'canvas' | 'sunken' | 'chrome';
  labelledBy?: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(
        'py-12 sm:py-16',
        tone === 'sunken' && 'border-y border-line bg-surface-sunken',
        tone === 'chrome' && 'bg-chrome text-chrome-fg',
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  );
}
