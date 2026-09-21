'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { moderateAdvertisementAction } from '@/app/admin/actions';
import { AdminDialog, ReasonPicker, composeNote } from '@/components/admin/dialog';
import { Button } from '@/components/ui/button';
import {
  ACTIONS,
  CHANGE_REQUESTS,
  MAX_NOTE,
  REJECTION_REASONS,
  actionsFor,
} from '@/lib/admin/moderation';
import type { AdStatus, ModerationAction } from '@/types/database';

/**
 * The decisions available on the review page.
 *
 * Which buttons appear is decided by the advertisement's current state, from
 * the same table the database enforces — so the interface does not offer a
 * move that would be refused. If the two ever disagree the database wins and
 * says why, and that message is what the dialog shows.
 */
export function ModerationActions({
  advertisementId,
  status,
  reference,
}: {
  advertisementId: string;
  status: AdStatus;
  reference: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<ModerationAction | null>(null);
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = actionsFor(status);
  if (!available.length) {
    return (
      <p className="px-4 py-3 text-sm text-fg-muted">
        Nothing to decide — this advertisement is {status.replace('_', ' ')}.
      </p>
    );
  }

  const copy = open ? ACTIONS[open] : null;
  const needsNote = copy?.requiresNote ?? false;
  const composed = composeNote(choice, note);

  function close() {
    if (busy) return;
    setOpen(null);
    setChoice('');
    setNote('');
    setError(null);
  }

  async function confirm() {
    if (!open) return;
    setBusy(true);
    setError(null);

    const result = await moderateAdvertisementAction({
      advertisementId,
      action: open,
      note: composed,
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? 'That could not be saved.');
      return;
    }

    setOpen(null);
    setChoice('');
    setNote('');
    // The page is server-rendered from the row that just changed.
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {available.map((action) => {
          const item = ACTIONS[action];
          return (
            <Button
              key={action}
              size="sm"
              variant={item.tone === 'primary' ? 'primary' : 'secondary'}
              className={
                item.tone === 'critical'
                  ? 'border-critical-line text-critical-fg hover:bg-critical-surface'
                  : undefined
              }
              onClick={() => {
                setOpen(action);
                setChoice('');
                setNote('');
                setError(null);
              }}
            >
              {item.label}
            </Button>
          );
        })}
      </div>

      <AdminDialog
        open={open !== null}
        title={copy?.question ?? ''}
        description={`${reference}. ${copy?.consequence ?? ''}`}
        confirmLabel={copy?.label ?? 'Confirm'}
        tone={copy?.tone}
        busy={busy}
        error={error}
        // The database refuses a refusal with no reason. Disabling the button
        // says so before the round trip rather than after it.
        disabled={needsNote && !composed}
        onConfirm={() => void confirm()}
        onClose={close}
      >
        {needsNote ? (
          <ReasonPicker
            options={open === 'reject' ? REJECTION_REASONS : CHANGE_REQUESTS}
            choice={choice}
            onChoice={setChoice}
            note={note}
            onNote={setNote}
            noteLabel={open === 'reject' ? 'Anything to add' : 'What needs changing'}
            maxLength={MAX_NOTE}
          />
        ) : null}
      </AdminDialog>
    </>
  );
}
