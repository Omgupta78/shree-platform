'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  approveRenewalAction,
  extendExpiryAction,
  moderateAdvertisementAction,
  rejectRenewalAction,
  runExpirySweepAction,
  type AdminActionResult,
} from '@/app/admin/actions';
import { AdminDialog } from '@/components/admin/dialog';
import { Button } from '@/components/ui/button';
import { MAX_NOTE } from '@/lib/admin/moderation';

/**
 * The office's lifecycle controls. Presentation and a round trip only: every
 * rule — who may, whether it is allowed, what the new date becomes — is in
 * the database function each button ends up calling.
 */

function useDecision() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<AdminActionResult>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? 'That could not be saved.');
      return false;
    }
    router.refresh();
    return true;
  }

  return { busy, error, setError, run };
}

function NoteField({
  id,
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-medium">
        {label}
        {required ? null : <span className="font-normal text-fg-subtle"> (optional)</span>}
      </span>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        maxLength={MAX_NOTE}
        placeholder={placeholder}
        className="mt-1 w-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-sm"
      />
    </label>
  );
}

/* ------------------------------------------------------------ renewal -- */

export function RenewalDecision({
  renewalId,
  reference,
  timing,
  packageName,
}: {
  renewalId: string;
  reference: string;
  timing: 'early' | 'after_expiry';
  packageName: string;
}) {
  const [open, setOpen] = useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const { busy, error, setError, run } = useDecision();

  function close() {
    if (busy) return;
    setOpen(null);
    setNote('');
    setError(null);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOpen('approve')}>
          Approve renewal
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="border-critical-line text-critical-fg hover:bg-critical-surface"
          onClick={() => setOpen('reject')}
        >
          Refuse renewal
        </Button>
      </div>

      <AdminDialog
        open={open !== null}
        title={open === 'approve' ? 'Approve this renewal?' : 'Refuse this renewal?'}
        description={
          open === 'approve'
            ? timing === 'early'
              ? `${reference}. The ${packageName} run is added to the end of the current one. It stays live throughout.`
              : `${reference}. It is published again from now, for a new ${packageName} run.`
            : timing === 'early'
              ? `${reference}. The current run is unaffected and ends on its date. The advertiser sees your reason.`
              : `${reference}. It is not republished. The advertiser sees your reason. Nothing is deleted.`
        }
        confirmLabel={open === 'approve' ? 'Approve renewal' : 'Refuse renewal'}
        tone={open === 'reject' ? 'critical' : 'primary'}
        busy={busy}
        error={error}
        disabled={open === 'reject' && !note.trim()}
        onConfirm={() =>
          void run(() =>
            open === 'approve'
              ? approveRenewalAction({ renewalId, note })
              : rejectRenewalAction({ renewalId, note }),
          ).then((ok) => ok && close())
        }
        onClose={close}
      >
        <NoteField
          id="renewal-note"
          label={open === 'reject' ? 'Reason' : 'Note for the history'}
          value={note}
          onChange={setNote}
          required={open === 'reject'}
        />
      </AdminDialog>
    </>
  );
}

/* ------------------------------------------------------------- extend -- */

export function ExtendExpiryDialog({
  advertisementId,
  reference,
  currentExpiryDate,
  maxDate,
}: {
  advertisementId: string;
  reference: string;
  /** YYYY-MM-DD in India — the input's minimum is the day after. */
  currentExpiryDate: string;
  maxDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, setError, run } = useDecision();

  function close() {
    if (busy) return;
    setOpen(false);
    setDate('');
    setReason('');
    setError(null);
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Extend Expiry
      </Button>
      <AdminDialog
        open={open}
        title="Extend this advertisement’s run?"
        description={`${reference}. It stays live until the end of the day you choose, in India. Recorded in the activity log with your reason.`}
        confirmLabel="Extend Expiry"
        busy={busy}
        error={error}
        disabled={!date || !reason.trim()}
        onConfirm={() =>
          void run(() =>
            extendExpiryAction({ advertisementId, newExpiryDate: date, reason }),
          ).then((ok) => ok && close())
        }
        onClose={close}
      >
        <div className="space-y-4">
          <label htmlFor="extend-date" className="block">
            <span className="text-sm font-medium">New expiry date</span>
            <input
              id="extend-date"
              type="date"
              value={date}
              min={currentExpiryDate}
              max={maxDate}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 h-10 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm"
            />
          </label>
          <NoteField id="extend-reason" label="Reason" value={reason} onChange={setReason} required />
        </div>
      </AdminDialog>
    </>
  );
}

/* ------------------------------------------------------------- expire -- */

export function ManualExpireDialog({
  advertisementId,
  reference,
}: {
  advertisementId: string;
  reference: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { busy, error, setError, run } = useDecision();

  function close() {
    if (busy) return;
    setOpen(false);
    setReason('');
    setError(null);
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        className="border-critical-line text-critical-fg hover:bg-critical-surface"
        onClick={() => setOpen(true)}
      >
        Mark as Expired
      </Button>
      <AdminDialog
        open={open}
        title="Why are you expiring this advertisement?"
        description={`${reference}. It stops being public now and is marked expired. Nothing is deleted, and the advertiser can renew it.`}
        confirmLabel="Mark as Expired"
        tone="critical"
        busy={busy}
        error={error}
        disabled={!reason.trim()}
        onConfirm={() =>
          void run(() =>
            moderateAdvertisementAction({ advertisementId, action: 'expire', note: reason }),
          ).then((ok) => ok && close())
        }
        onClose={close}
      >
        <NoteField id="expire-reason" label="Reason" value={reason} onChange={setReason} required />
      </AdminDialog>
    </>
  );
}

/* -------------------------------------------------------------- sweep -- */

export function RunExpirySweep() {
  const { busy, error, run } = useDecision();
  const [done, setDone] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const result = await runExpirySweepAction();
            if (result.ok) {
              setDone(
                result.count
                  ? `${result.count} advertisement${result.count === 1 ? '' : 's'} expired.`
                  : 'Nothing was due to expire.',
              );
            }
            return result;
          })
        }
      >
        {busy ? 'Checking…' : 'Run expiry check now'}
      </Button>
      {done ? (
        <span role="status" className="text-sm text-fg-muted">
          {done}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-sm text-critical-fg">
          {error}
        </span>
      ) : null}
    </div>
  );
}
