import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { ADMIN_STATUS_COPY } from '@/lib/admin/moderation';
import { cn } from '@/lib/utils';
import type { AdStatus } from '@/types/database';

/**
 * The pieces every admin page is built from.
 *
 * Server Components with no state of their own. Keeping the page furniture in
 * one file is what stops nine tables from each inventing their own idea of
 * what a heading, an empty state or a status chip looks like — in a screen
 * somebody works in all day, consistency is not decoration, it is how they
 * stop reading and start scanning.
 */

export function AdminPageHeader({
  title,
  description,
  count,
  actions,
}: {
  title: string;
  description?: string;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold sm:text-3xl">
          {title}
          {count !== undefined ? (
            <span className="ml-2 align-middle text-base font-normal text-fg-subtle tabular-nums">
              {count}
            </span>
          ) : null}
        </h1>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function StatusBadge({ status }: { status: AdStatus }) {
  const copy = ADMIN_STATUS_COPY[status];
  return <Badge tone={copy.tone}>{copy.label}</Badge>;
}

export function AdminPanel({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-md border border-line bg-surface', className)}>
      {title ? (
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function AdminEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-md border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1.5 text-sm text-fg-muted">{description}</p> : null}
    </div>
  );
}

/**
 * A definition row, for the panels that are mostly labelled facts.
 *
 * `dl`/`dt`/`dd` rather than a table, because these are a set of
 * label-and-value pairs and not a grid — a screen reader should announce them
 * as such.
 */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-line px-4 py-2.5 last:border-b-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="min-w-0 text-right text-sm break-words">{children}</dd>
    </div>
  );
}

/**
 * Responsive table scaffolding.
 *
 * A table at a desk and a horizontally scrollable one on a phone. Not stacked
 * cards: the queue is read by comparing rows against each other, and cards
 * lose exactly the alignment that makes that possible. What it keeps is the
 * reference and the action in the first and last columns, which is what a
 * thumb reaches for.
 */
export function AdminTable({
  head,
  children,
  caption,
}: {
  head: ReactNode;
  children: ReactNode;
  caption?: string;
}) {
  return (
    <div className="relative -mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line bg-surface-sunken text-left">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2 text-xs font-semibold tracking-wide text-fg-muted uppercase',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('border-b border-line px-3 py-2.5 align-top', className)}>{children}</td>;
}

/** Paging that keeps every other filter in the URL. */
export function AdminPagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label="Pages"
      className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm"
    >
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="font-medium text-primary hover:underline">
          ← Previous
        </Link>
      ) : (
        <span className="text-fg-subtle">← Previous</span>
      )}

      <span className="text-fg-muted tabular-nums">
        Page {page} of {pageCount}
      </span>

      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className="font-medium text-primary hover:underline">
          Next →
        </Link>
      ) : (
        <span className="text-fg-subtle">Next →</span>
      )}
    </nav>
  );
}

/**
 * How long something has been waiting, said plainly.
 *
 * Whole hours under a day and whole days above it. "1.7 days" is a figure, not
 * an answer; somebody deciding what to pick up next wants "2 days".
 */
export function waitingLabel(hours: number): string {
  if (hours < 1) return 'under an hour';
  if (hours < 24) return `${Math.floor(hours)} hr`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

export function WaitingFor({ hours }: { hours: number }) {
  // Two days in the queue is the point at which somebody should notice.
  const overdue = hours >= 48;
  return (
    <span className={overdue ? 'font-medium text-critical-fg' : 'text-fg-muted'}>
      {waitingLabel(hours)}
    </span>
  );
}
