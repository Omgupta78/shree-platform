'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { reportAdvertisementAction } from '@/app/classifieds/actions';
import { Button } from '@/components/ui/button';
import { AlertIcon, CheckIcon, CloseIcon, FlagIcon } from '@/components/ui/icons';

/**
 * Report an advertisement.
 *
 * Writes to `ad_reports` through a Server Action. No account is needed: the
 * row-level policy accepts a report with a null reporter, and requiring a
 * sign-in would mean the advertisements most worth reporting are the ones
 * nobody reports. A signed-in reader is recorded, and may report a given
 * advertisement once.
 *
 * `REASONS` below is the `report_reason` enum, value for value.
 */
const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'fraud', label: 'Fraud or suspicious' },
  { value: 'incorrect', label: 'Incorrect information' },
  { value: 'offensive', label: 'Offensive content' },
  { value: 'unavailable', label: 'Advertisement no longer available' },
  { value: 'other', label: 'Other' },
] as const;

export function ReportAdvertisementModal({
  advertisementId,
  reference,
}: {
  advertisementId: string;
  reference: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>('');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  function close() {
    setOpen(false);
    // Reset after the panel has gone, ready for a second report.
    setSubmitted(false);
    setReason('');
    setNote('');
    setError(null);
    setSending(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;

    setSending(true);
    setError(null);

    const result = await reportAdvertisementAction({
      advertisementId,
      reason,
      details: note,
    });

    setSending(false);
    if (result.ok) {
      setSubmitted(true);
    } else {
      setError(result.message ?? 'We could not record that just now.');
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-fg-subtle underline-offset-4 transition-colors hover:text-primary hover:underline"
      >
        <FlagIcon size={14} />
        Report this advertisement
      </button>

      {open ? (
        <div className="fixed inset-0 z-60 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={close}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
          />

          <div
            ref={panelRef}
            data-report-modal=""
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            tabIndex={-1}
            className="relative w-full max-w-md rounded-t-lg bg-surface shadow-raised outline-none sm:rounded-lg"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 id="report-title" className="font-serif text-lg font-semibold">
                {submitted ? 'Report received' : 'Report this advertisement'}
              </h2>
              <button
                type="button"
                onClick={close}
                className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-sm hover:bg-surface-sunken"
              >
                <CloseIcon />
                <span className="sr-only">Close</span>
              </button>
            </div>

            {submitted ? (
              <div className="px-5 py-8 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-positive-surface text-positive-fg">
                  <CheckIcon size={22} />
                </span>
                <p className="mt-4 text-[0.9375rem] font-medium">
                  Thank you. Your report has been received.
                </p>
                <p className="mt-2 text-sm text-fg-muted">
                  Our office reviews reported advertisements and will act where
                  necessary.
                </p>
                <Button onClick={close} className="mt-6">
                  Close
                </Button>
              </div>
            ) : (
              <form onSubmit={(event) => void submit(event)} className="px-5 py-5">
                <p className="text-sm text-fg-muted">
                  Advertisement <span className="tabular-nums">{reference}</span>. Tell us
                  what is wrong and our office will look into it.
                </p>

                <fieldset className="mt-4">
                  <legend className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
                    Reason
                  </legend>
                  <div className="mt-2 space-y-1">
                    {REASONS.map((item) => (
                      <label
                        key={item.value}
                        className="flex cursor-pointer items-center gap-2.5 rounded-sm py-1.5 text-sm has-checked:font-medium"
                      >
                        <input
                          type="radio"
                          name="reason"
                          value={item.value}
                          checked={reason === item.value}
                          onChange={() => setReason(item.value)}
                          required
                          className="h-4 w-4 accent-primary-solid"
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="mt-4">
                  <label
                    htmlFor="report-note"
                    className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase"
                  >
                    Anything else (optional)
                  </label>
                  <textarea
                    id="report-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    maxLength={500}
                    className="mt-2 w-full rounded-sm border border-line-strong bg-surface p-3 text-sm transition-colors hover:border-fg-subtle"
                  />
                </div>

                {error ? (
                  <p
                    role="alert"
                    className="mt-4 flex gap-2 rounded-sm border border-critical-line bg-critical-surface p-3 text-sm text-critical-fg"
                  >
                    <AlertIcon size={17} className="mt-px shrink-0" />
                    {error}
                  </p>
                ) : null}

                <div className="mt-5 flex gap-2">
                  <Button type="submit" disabled={!reason || sending} fullWidth>
                    {sending ? 'Sending…' : 'Submit report'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={close}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
