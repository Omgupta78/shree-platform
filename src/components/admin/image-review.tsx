'use client';

import Image from 'next/image';
import { useState } from 'react';

import { FileIcon } from '@/components/ui/icons';
import type { AdvertisementArtwork, AdvertisementImage } from '@/lib/admin/advertisements';
import { cn } from '@/lib/utils';

/**
 * Looking properly at what was uploaded.
 *
 * Half of moderation is deciding whether a photograph is usable, and that
 * cannot be done from a thumbnail. A large preview, a strip to move through,
 * the stored path for when something has to be traced, and a link that opens
 * the file at its own size in a new tab.
 *
 * The first image is marked, because it is the one that appears on every
 * listing card — and the one an advertiser will ring about if it is the wrong
 * one.
 */
export function ImageReview({ images }: { images: AdvertisementImage[] }) {
  const [index, setIndex] = useState(0);

  if (!images.length) {
    return (
      <p className="px-4 py-6 text-sm text-fg-muted">
        No photographs were uploaded with this advertisement.
      </p>
    );
  }

  const current = images[Math.min(index, images.length - 1)]!;

  return (
    <div className="p-4">
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-sm bg-surface-sunken">
        {current.url ? (
          <Image
            src={current.url}
            alt={`Photograph ${index + 1} of ${images.length}`}
            fill
            sizes="(min-width: 1024px) 40rem, 100vw"
            className="object-contain"
            // Not optimised: a moderator is judging whether the picture is
            // usable, and a resized, recompressed copy is not the thing they
            // are being asked about.
            unoptimized
          />
        ) : (
          <span className="flex h-full items-center justify-center text-sm text-fg-subtle">
            This image could not be loaded.
          </span>
        )}
      </div>

      {images.length > 1 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {images.map((image, position) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setIndex(position)}
                aria-current={position === index ? 'true' : undefined}
                className={cn(
                  'relative block h-16 w-20 overflow-hidden rounded-sm border-2 bg-surface-sunken',
                  position === index ? 'border-primary' : 'border-transparent hover:border-line-strong',
                )}
              >
                {image.url ? (
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                    unoptimized
                  />
                ) : null}
                <span className="sr-only">Photograph {position + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="mt-3 space-y-1 text-xs text-fg-subtle">
        <div className="flex gap-2">
          <dt>Position</dt>
          <dd className="text-fg-muted">
            {index + 1} of {images.length}
            {current.sortOrder === 0 ? ' · shown on the listing card' : ''}
          </dd>
        </div>
        {current.width && current.height ? (
          <div className="flex gap-2">
            <dt>Size</dt>
            <dd className="text-fg-muted tabular-nums">
              {current.width} × {current.height}
            </dd>
          </div>
        ) : null}
        <div className="flex min-w-0 gap-2">
          <dt className="shrink-0">Stored at</dt>
          <dd className="truncate font-mono text-fg-muted">{current.storagePath}</dd>
        </div>
      </dl>

      {current.url ? (
        <a
          href={current.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
        >
          Open at full size →
        </a>
      ) : null}
    </div>
  );
}

/**
 * Display artwork.
 *
 * Usually a PDF, so there is nothing to preview inline — and the bucket is
 * private, so the links are signed server-side and last a few minutes. That is
 * why they are not simply `href`s to a public path: an advertiser's design
 * before their campaign runs is commercially sensitive, and a public URL is a
 * public URL whether or not anyone has guessed it.
 */
export function ArtworkReview({ artwork }: { artwork: AdvertisementArtwork[] }) {
  if (!artwork.length) {
    return (
      <p className="px-4 py-6 text-sm text-fg-muted">
        No artwork has been attached. The advertiser may be asking us to design it.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {artwork.map((file) => (
        <li key={file.id} className="flex items-center gap-3 px-4 py-3">
          <FileIcon size={18} className="shrink-0 text-fg-subtle" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.fileName}</p>
            <p className="text-xs text-fg-subtle">
              {file.contentType} · {formatBytes(file.byteSize)}
            </p>
          </div>
          {file.signedUrl ? (
            <a
              href={file.signedUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-sm font-medium text-primary hover:underline"
            >
              Open
            </a>
          ) : (
            <span className="shrink-0 text-xs text-fg-subtle">link unavailable</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
