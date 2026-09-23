'use client';

import { useCallback, useEffect, useState } from 'react';

import { CategoryIcon, CloseIcon } from '@/components/ui/icons';
import type { CategoryIconName } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * Image gallery for an advertisement.
 *
 * Images keep a fixed 4:3 frame and are fitted inside it with `object-contain`
 * rather than cropped — an advertiser's photograph of a shop front or a
 * vehicle should not lose its edges to a square crop, and letterboxing is the
 * honest way to show an image whose proportions differ from the frame.
 *
 * With no images at all it falls back to the same typographic panel the
 * listing cards use, so nothing ever renders as a broken image.
 */
export function AdvertisementGallery({
  images,
  title,
  place,
  categoryName,
  categoryIcon,
}: {
  images: readonly string[];
  title: string;
  /** The town the advertisement is placed for, for the alternative text. */
  place?: string;
  categoryName: string;
  categoryIcon: CategoryIconName | string | null;
}) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const count = images.length;

  const go = useCallback(
    (delta: number) => setIndex((current) => (current + delta + count) % count),
    [count],
  );

  // Arrow keys move through the gallery whenever the lightbox is open;
  // Escape closes it.
  useEffect(() => {
    if (!lightbox) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setLightbox(false);
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [lightbox, go]);

  if (count === 0) {
    return (
      <div className="flex aspect-4/3 w-full flex-col items-center justify-center gap-3 rounded-md border border-line bg-surface-sunken text-fg-subtle">
        <CategoryIcon name={categoryIcon} size={40} />
        <span className="font-serif text-xl">{categoryName}</span>
        <span className="text-xs tracking-[0.14em] uppercase">
          No image supplied
        </span>
      </div>
    );
  }

  const current = images[index] as string;
  const subject = place ? `${title} in ${place}` : title;
  /*
   * "2 BHK flat for rent in Roorkee — photograph 2 of 4".
   *
   * The advertiser's own title and their town, and nothing else. A list of
   * search terms appended here would be keyword stuffing done on their behalf,
   * and it is read aloud to somebody using a screen reader — who wants to know
   * what the picture shows, not what the page hopes to rank for.
   */
  const alt = count > 1 ? `${subject} — photograph ${index + 1} of ${count}` : subject;

  return (
    <div>
      <div
        data-gallery="frame"
        className="relative overflow-hidden rounded-md border border-line bg-surface-sunken"
      >
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="block w-full cursor-zoom-in"
          aria-label={`Enlarge image ${index + 1} of ${count}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- advertiser upload, sized at upload time */}
          <img
            src={current}
            alt={alt}
            className="aspect-4/3 w-full object-contain"
          />
        </button>

        {count > 1 ? (
          <>
            <GalleryArrow side="left" onClick={() => go(-1)} />
            <GalleryArrow side="right" onClick={() => go(1)} />
            <p
              data-gallery="counter"
              className="absolute right-3 bottom-3 rounded-sm bg-black/70 px-2 py-1 text-xs font-medium text-white tabular-nums"
            >
              {index + 1} / {count}
            </p>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, position) => (
            <li key={image}>
              <button
                type="button"
                onClick={() => setIndex(position)}
                data-gallery="thumb"
                aria-label={`Show image ${position + 1}`}
                aria-current={position === index ? 'true' : undefined}
                className={cn(
                  'block h-16 w-20 shrink-0 overflow-hidden rounded-sm border-2 bg-surface-sunken transition-colors',
                  position === index
                    ? 'border-primary'
                    : 'border-line hover:border-line-strong',
                )}
              >
                {/*
                  Empty alt on purpose: the button around it already carries
                  "Show image 2", so describing the picture again would have a
                  screen reader announce the same control twice.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element -- advertiser upload */}
                <img src={image} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {lightbox ? (
        <div
          data-lightbox=""
          role="dialog"
          aria-modal="true"
          aria-label={`${title} — image viewer`}
          className="fixed inset-0 z-60 flex flex-col bg-black/90"
        >
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <p className="text-sm tabular-nums">
              {index + 1} / {count}
            </p>
            <button
              type="button"
              onClick={() => setLightbox(false)}
              autoFocus
              className="inline-flex h-10 w-10 items-center justify-center rounded-sm hover:bg-white/10"
            >
              <CloseIcon />
              <span className="sr-only">Close image viewer</span>
            </button>
          </div>

          <div className="relative flex flex-1 items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- advertiser upload */}
            <img src={current} alt={alt} className="max-h-full max-w-full object-contain" />
            {count > 1 ? (
              <>
                <GalleryArrow side="left" onClick={() => go(-1)} onDark />
                <GalleryArrow side="right" onClick={() => go(1)} onDark />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GalleryArrow({
  side,
  onClick,
  onDark = false,
}: {
  side: 'left' | 'right';
  onClick: () => void;
  onDark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-gallery={side === 'left' ? 'prev' : 'next'}
      className={cn(
        'absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white transition-colors',
        side === 'left' ? 'left-3' : 'right-3',
        onDark ? 'bg-white/15 hover:bg-white/25' : 'bg-black/55 hover:bg-black/75',
      )}
    >
      <span aria-hidden="true" className="text-xl leading-none">
        {side === 'left' ? '‹' : '›'}
      </span>
      <span className="sr-only">{side === 'left' ? 'Previous image' : 'Next image'}</span>
    </button>
  );
}
