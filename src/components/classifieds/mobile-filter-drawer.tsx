'use client';

import { useEffect, useRef, useState } from 'react';

import { FilterControls } from '@/components/classifieds/filter-controls';
import { Button } from '@/components/ui/button';
import { CloseIcon, FilterIcon } from '@/components/ui/icons';
import { useQueryNavigation } from '@/lib/classifieds/use-query-navigation';

/**
 * Filters on small screens.
 *
 * A full-height sheet rather than a shrunken sidebar: the controls stay at a
 * comfortable touch size, the result count stays visible in the footer, and
 * the page behind does not scroll away underneath.
 */
export function MobileFilterDrawer({
  categorySlug,
  activeCount,
  resultCount,
}: {
  categorySlug: string | null;
  activeCount: number;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const { clearAll } = useQueryNavigation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="filter-drawer"
        className="inline-flex h-11 items-center gap-2 rounded-sm border border-line-strong bg-surface px-4 text-sm font-medium transition-colors hover:border-primary lg:hidden"
      >
        <FilterIcon size={16} />
        Filters
        {activeCount > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-solid px-1.5 text-[0.6875rem] font-semibold text-primary-fg tabular-nums">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
          />
          <div
            id="filter-drawer"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Filter advertisements"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-[min(22rem,92vw)] flex-col bg-surface shadow-raised outline-none"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-serif text-lg font-semibold">Filters</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-sm hover:bg-surface-sunken"
              >
                <CloseIcon />
                <span className="sr-only">Close filters</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <FilterControls categorySlug={categorySlug} />
            </div>

            <div className="space-y-2 border-t border-line p-4">
              <Button onClick={() => setOpen(false)} fullWidth>
                Show {resultCount} {resultCount === 1 ? 'advertisement' : 'advertisements'}
              </Button>
              {activeCount > 0 ? (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    clearAll();
                    setOpen(false);
                  }}
                >
                  Clear all filters
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
