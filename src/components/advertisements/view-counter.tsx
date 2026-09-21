'use client';

import { useEffect, useRef } from 'react';

import { recordAdvertisementViewAction } from '@/app/classifieds/actions';

/**
 * Counts one view, once, when the advertisement is actually on a screen.
 *
 * Renders nothing. A ref rather than a state flag, so React's development
 * double-invocation of effects does not count two views, and so a navigation
 * back to the same advertisement in the same session does not either.
 *
 * Deliberately not done during the server render: a render happens for
 * prefetches and for metadata generation, and an advertiser reading "eleven
 * views" should be told about eleven readers.
 */
export function ViewCounter({ advertisementId }: { advertisementId: string }) {
  const counted = useRef<string | null>(null);

  useEffect(() => {
    if (counted.current === advertisementId) return;
    counted.current = advertisementId;

    // Nothing on the page depends on the result, and a reader should never see
    // an error because a counter failed.
    void recordAdvertisementViewAction(advertisementId).catch(() => {});
  }, [advertisementId]);

  return null;
}
