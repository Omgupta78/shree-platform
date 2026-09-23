'use client';

import { useEffect, useRef } from 'react';

import { recordSearchAction } from '@/app/classifieds/actions';

/**
 * Records one search, once, when its results are on screen.
 *
 * Renders nothing. The ref holds what was last recorded, so React's
 * development double-invocation of effects does not write the same search
 * twice, and so changing a filter without changing the words does not either.
 *
 * Rendered only for the first page of results: pages two and three of the same
 * search are the same question, and counting them again would make a long
 * results list look like a popular term.
 */
export function SearchRecorder({
  term,
  resultCount,
  categorySlug,
}: {
  term: string;
  resultCount: number;
  categorySlug: string | null;
}) {
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    const key = `${categorySlug ?? ''}:${term}`;
    if (recorded.current === key) return;
    recorded.current = key;

    // Nothing on the page depends on this, and a reader should never see an
    // error because a counter failed.
    void recordSearchAction({ term, resultCount, categorySlug }).catch(() => {});
  }, [term, resultCount, categorySlug]);

  return null;
}
