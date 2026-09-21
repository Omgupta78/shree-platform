'use client';

import { useId, useRef, useState, type DragEvent } from 'react';

import { usePostAd } from '@/components/post-ad/form-provider';
import { Badge } from '@/components/ui/badge';
import {
  AlertIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  FileIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
} from '@/components/ui/icons';
import {
  acceptFiles,
  formatBytes,
  isPdf,
  releaseImages,
  type FileRules,
} from '@/lib/post-ad/images';
import { cn } from '@/lib/utils';
import type { SubmissionImage } from '@/types/submission';

/**
 * Picking, previewing, ordering and removing files.
 *
 * Nothing leaves the browser. Each file becomes an object URL for its
 * preview, and every path that drops a file revokes its URL so the blob is
 * not pinned in memory for the life of the page.
 *
 * Ordering is done with buttons rather than pointer dragging. Dragging a
 * thumbnail is pleasant with a mouse and close to unusable with a finger or a
 * keyboard, and this form is built for a phone first; the same two buttons
 * work for everyone, and the first image is the primary one.
 */
export function ImageUploader({
  target,
  rules,
  heading,
  emptyHint,
}: {
  target: 'images' | 'artwork';
  rules: FileRules;
  heading: string;
  emptyHint: string;
}) {
  const { state, dispatch } = usePostAd();
  const files = state[target];
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = useId();

  function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    const { accepted, error } = acceptFiles(Array.from(list), files, rules);
    if (accepted.length) dispatch({ type: 'addImages', target, images: accepted });
    dispatch({ type: 'fileError', message: error });
  }

  function remove(image: SubmissionImage) {
    // Revoke before dropping it: once it has left state nothing else holds the
    // URL, and an un-revoked object URL keeps its blob alive until reload.
    releaseImages([image]);
    dispatch({ type: 'removeImage', target, id: image.id });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    add(event.dataTransfer.files);
  }

  const full = files.length >= rules.maxFiles;

  return (
    <div className="space-y-4" data-step={target}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-dropzone={target}
        className={cn(
          'rounded-md border-2 border-dashed p-6 text-center transition-colors sm:p-10',
          dragging ? 'border-primary bg-primary-surface' : 'border-line-strong bg-surface',
          full && 'opacity-60',
        )}
      >
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-fg-subtle">
          <UploadIcon size={22} />
        </span>

        <p className="mt-4 font-serif text-lg font-semibold">{heading}</p>
        <p className="mt-1 text-sm text-fg-muted">{emptyHint}</p>

        {/* A real file input, labelled — not a button calling .click(), which
            keyboard and assistive technology handle less predictably. */}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={rules.accept.join(',')}
          disabled={full}
          onChange={(event) => {
            add(event.target.files);
            // Reset, so choosing the same file twice in a row still fires.
            event.target.value = '';
          }}
          className="sr-only"
        />
        <label
          htmlFor={inputId}
          className={cn(
            'mt-5 inline-flex h-11 cursor-pointer items-center justify-center rounded-sm px-5',
            'text-[0.9375rem] font-medium transition-colors',
            'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
            full
              ? 'cursor-not-allowed bg-surface-sunken text-fg-subtle'
              : 'border border-line-strong bg-surface text-fg hover:bg-surface-sunken',
          )}
        >
          {full ? `Maximum ${rules.maxFiles} files added` : 'Browse files'}
        </label>

        <p className="mt-3 text-xs text-fg-subtle">
          {rules.label}. Up to {rules.maxFiles} files. You can also drag them here.
        </p>
      </div>

      {state.fileError ? (
        <p
          role="alert"
          data-file-error
          className="flex gap-2 rounded-sm border border-critical-line bg-critical-surface p-3 text-sm text-critical-fg"
        >
          <AlertIcon size={17} className="mt-px shrink-0" />
          {state.fileError}
        </p>
      ) : null}

      {files.length > 0 ? (
        <>
          <p className="text-sm text-fg-muted" role="status">
            {files.length} of {rules.maxFiles} added. The first is used as the main image.
          </p>

          <ul className="space-y-3" data-file-list={target}>
            {files.map((image, index) => (
              <li
                key={image.id}
                data-file-item
                className="flex gap-3 rounded-md border border-line bg-surface p-3"
              >
                <Thumbnail image={image} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium" title={image.name}>
                      {image.name}
                    </p>
                    {index === 0 ? <Badge tone="featured">Main image</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-fg-subtle">{formatBytes(image.size)}</p>

                  <div className="mt-2 flex flex-wrap gap-1">
                    <IconAction
                      label={`Move ${image.name} up`}
                      disabled={index === 0}
                      onClick={() => dispatch({ type: 'moveImage', target, id: image.id, direction: -1 })}
                      data-action="up"
                    >
                      <ArrowUpIcon size={15} />
                    </IconAction>
                    <IconAction
                      label={`Move ${image.name} down`}
                      disabled={index === files.length - 1}
                      onClick={() => dispatch({ type: 'moveImage', target, id: image.id, direction: 1 })}
                      data-action="down"
                    >
                      <ArrowDownIcon size={15} />
                    </IconAction>
                    <IconAction
                      label={`Make ${image.name} the main image`}
                      disabled={index === 0}
                      onClick={() => dispatch({ type: 'makePrimary', target, id: image.id })}
                      data-action="primary"
                    >
                      <StarIcon size={15} />
                      <span className="text-xs">Main</span>
                    </IconAction>
                    <IconAction
                      label={`Remove ${image.name}`}
                      onClick={() => remove(image)}
                      data-action="remove"
                      tone="critical"
                    >
                      <TrashIcon size={15} />
                      <span className="text-xs">Remove</span>
                    </IconAction>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="text-xs leading-relaxed text-fg-subtle">
        Files stay in your browser until you submit. Please send photographs you took or own —
        advertisements using someone else&rsquo;s pictures are not published.
      </p>
    </div>
  );
}

function Thumbnail({ image }: { image: SubmissionImage }) {
  if (isPdf(image)) {
    return (
      <span className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-sm bg-surface-sunken text-fg-subtle">
        <FileIcon size={22} />
        <span className="text-[0.625rem] tracking-wider uppercase">PDF</span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- local object URL, never optimised
    <img
      src={image.previewUrl}
      alt={image.name}
      data-file-preview
      className="h-20 w-20 shrink-0 rounded-sm border border-line bg-surface-sunken object-cover"
    />
  );
}

function IconAction({
  label,
  children,
  disabled,
  onClick,
  tone = 'default',
  ...rest
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: 'default' | 'critical';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-sm border border-line px-2 transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'critical'
          ? 'text-critical-fg hover:border-critical-line hover:bg-critical-surface'
          : 'text-fg-muted hover:border-line-strong hover:bg-surface-sunken',
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
