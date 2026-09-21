import Link from 'next/link';

import { queryHref, type AdQuery } from '@/lib/classifieds/query';
import { cn } from '@/lib/utils';

/**
 * Pagination as real links, so pages are crawlable, middle-clickable and work
 * without JavaScript. Long runs collapse to first, last and a window around
 * the current page.
 */
function pageNumbers(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, total, current]);
  if (current > 1) pages.add(current - 1);
  if (current < total) pages.add(current + 1);
  if (current <= 3) pages.add(2).add(3).add(4);
  if (current >= total - 2) pages.add(total - 1).add(total - 2).add(total - 3);

  const sorted = [...pages].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) out.push('gap');
    out.push(page);
    previous = page;
  }
  return out;
}

const LINK =
  'inline-flex h-10 min-w-10 items-center justify-center rounded-sm border px-3 text-sm font-medium transition-colors';

export function Pagination({
  query,
  page,
  pageCount,
}: {
  query: AdQuery;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Advertisement pages" className="mt-10">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        <li>
          {page > 1 ? (
            <Link
              href={queryHref(query, { page: page - 1 })}
              rel="prev"
              className={cn(LINK, 'border-line-strong bg-surface hover:border-primary hover:text-primary')}
            >
              Previous
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(LINK, 'border-line text-fg-subtle opacity-50')}>
              Previous
            </span>
          )}
        </li>

        {pageNumbers(page, pageCount).map((entry, index) =>
          entry === 'gap' ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-fg-subtle">
              &hellip;
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={queryHref(query, { page: entry })}
                aria-current={entry === page ? 'page' : undefined}
                aria-label={`Page ${entry}`}
                className={cn(
                  LINK,
                  entry === page
                    ? 'border-primary-solid bg-primary-solid text-primary-fg'
                    : 'border-line-strong bg-surface hover:border-primary hover:text-primary',
                )}
              >
                {entry}
              </Link>
            </li>
          ),
        )}

        <li>
          {page < pageCount ? (
            <Link
              href={queryHref(query, { page: page + 1 })}
              rel="next"
              className={cn(LINK, 'border-line-strong bg-surface hover:border-primary hover:text-primary')}
            >
              Next
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(LINK, 'border-line text-fg-subtle opacity-50')}>
              Next
            </span>
          )}
        </li>
      </ul>

      <p className="mt-3 text-center text-xs text-fg-subtle">
        Page {page} of {pageCount}
      </p>
    </nav>
  );
}
