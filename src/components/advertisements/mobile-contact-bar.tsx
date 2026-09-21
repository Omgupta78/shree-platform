'use client';

import { ContactActions } from '@/components/advertisements/contact-actions';
import type { Advertisement } from '@/types/content';

/**
 * Sticky contact bar for small screens.
 *
 * Fixed to the bottom below `lg`. Two things keep it from covering content:
 * the bar sits inside the safe-area inset so it clears the home indicator on
 * an iPhone, and the page adds matching bottom padding (`pb-28 lg:pb-0`) so
 * the last section can always be scrolled clear of it.
 */
export function MobileContactBar({ advertisement }: { advertisement: Advertisement }) {
  return (
    <div
      data-contact-bar=""
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-sm lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="px-4 py-3">
        <ContactActions advertisement={advertisement} layout="bar" />
      </div>
    </div>
  );
}
