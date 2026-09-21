'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { AlertIcon, CloseIcon } from '@/components/ui/icons';

/**
 * The confirmation dialog every irreversible-looking decision passes through.
 *
 * One implementation, because the failure mode of having several is that the
 * dangerous one is the one missing the Escape handler. It traps nothing but
 * moves focus in, restores it on close, locks background scroll, and closes on
 * Escape and on the backdrop.
 *
 * The confirm button carries the verb — "Approve advertisement", not "OK".
 * Somebody clicking quickly reads the button, not the sentence above it.
 */
export function AdminDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  busy,
  error,
  disabled,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  tone?: 'primary' | 'critical' | 'secondary';
  busy?: boolean;
  error?: string | null;
  disabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-t-lg bg-surface shadow-raised outline-none sm:rounded-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="font-serif text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mt-1 -mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm hover:bg-surface-sunken"
          >
            <CloseIcon />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="px-5 py-4">
          {description ? (
            <p id={descriptionId} className="text-sm text-fg-muted">
              {description}
            </p>
          ) : null}

          {children ? <div className="mt-4">{children}</div> : null}

          {error ? (
            <p
              role="alert"
              className="mt-4 flex gap-2 rounded-sm border border-critical-line bg-critical-surface p-3 text-sm text-critical-fg"
            >
              <AlertIcon size={17} className="mt-px shrink-0" />
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy || disabled}
            aria-busy={busy || undefined}
            className={
              tone === 'critical'
                ? 'bg-critical-fg text-white hover:brightness-110'
                : tone === 'secondary'
                  ? 'border border-line-strong bg-surface text-fg hover:bg-surface-sunken'
                  : undefined
            }
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The reason picker the reject and request-changes dialogs share. */
export function ReasonPicker({
  options,
  choice,
  onChoice,
  note,
  onNote,
  noteLabel,
  maxLength,
}: {
  options: readonly string[];
  choice: string;
  onChoice: (value: string) => void;
  note: string;
  onNote: (value: string) => void;
  noteLabel: string;
  maxLength: number;
}) {
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
          Reason
        </legend>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2.5 rounded-sm py-1.5 text-sm has-checked:font-medium"
            >
              <input
                type="radio"
                name="admin-reason"
                value={option}
                checked={choice === option}
                onChange={() => onChoice(option)}
                className="h-4 w-4 accent-primary-solid"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="admin-note" className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
          {noteLabel}
        </label>
        <textarea
          id="admin-note"
          value={note}
          onChange={(event) => onNote(event.target.value)}
          rows={3}
          maxLength={maxLength}
          className="mt-2 w-full rounded-sm border border-line-strong bg-surface p-3 text-sm transition-colors hover:border-fg-subtle"
        />
        <p className="mt-1 text-xs text-fg-subtle">
          The advertiser reads this on their own page. Write it to them, not about them.
        </p>
      </div>
    </div>
  );
}

/**
 * What actually gets stored.
 *
 * The chosen reason and the typed note joined into one sentence, because the
 * advertiser sees a single message and "Other" on its own says nothing.
 */
export function composeNote(choice: string, note: string): string {
  const trimmed = note.trim();
  if (!choice || choice === 'Other') return trimmed;
  return trimmed ? `${choice} — ${trimmed}` : choice;
}
