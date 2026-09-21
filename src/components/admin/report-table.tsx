'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { resolveReportAction } from '@/app/admin/actions';
import { AdminDialog } from '@/components/admin/dialog';
import { AdminEmpty, AdminTable, Td, Th } from '@/components/admin/admin-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  REPORT_REASON_COPY,
  REPORT_STATUS_COPY,
  type AdminReport,
} from '@/lib/admin/labels';
import { formatDate, formatRelative } from '@/lib/format';

/**
 * The report queue.
 *
 * A report is a reader's opinion, not a verdict — nothing here touches the
 * advertisement. Acting on a report means going and looking at it, which is
 * what the reference link is for, and then deciding there. This screen records
 * what the office concluded about the report itself.
 */
export function ReportTable({ reports }: { reports: AdminReport[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<{ report: AdminReport; status: 'actioned' | 'dismissed' } | null>(
    null,
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!reports.length) {
    return (
      <AdminEmpty
        title="No reports"
        description="Readers can flag an advertisement from its page. Anything they send lands here."
      />
    );
  }

  function close() {
    if (busy) return;
    setTarget(null);
    setNote('');
    setError(null);
  }

  async function run(status: 'reviewing' | 'actioned' | 'dismissed', report: AdminReport) {
    setBusy(true);
    setError(null);
    const result = await resolveReportAction({ reportId: report.id, status, note });
    setBusy(false);

    if (!result.ok) {
      setError(result.message ?? 'That could not be saved.');
      return;
    }
    setTarget(null);
    setNote('');
    router.refresh();
  }

  return (
    <>
      <div className="rounded-md border border-line bg-surface">
        <AdminTable
          caption="Reader reports"
          head={
            <>
              <Th className="w-32">Advertisement</Th>
              <Th className="w-40">Reason</Th>
              <Th>What they said</Th>
              <Th className="w-36">Reporter</Th>
              <Th className="w-28">When</Th>
              <Th className="w-36">Status</Th>
              <Th className="w-44">
                <span className="sr-only">Actions</span>
              </Th>
            </>
          }
        >
          {reports.map((report) => {
            const status = REPORT_STATUS_COPY[report.status];
            const settled = report.status === 'actioned' || report.status === 'dismissed';

            return (
              <tr key={report.id} className="hover:bg-surface-sunken">
                <Td>
                  <Link
                    href={`/admin/advertisements/${report.adId}`}
                    className="font-mono text-xs font-medium text-primary hover:underline"
                  >
                    {report.adReference ?? 'View'}
                  </Link>
                  <span className="mt-0.5 block max-w-40 truncate text-xs text-fg-subtle">
                    {report.adTitle}
                  </span>
                </Td>

                <Td>
                  <Badge tone={report.reason === 'fraud' ? 'danger' : 'neutral'}>
                    {REPORT_REASON_COPY[report.reason]}
                  </Badge>
                </Td>

                <Td className="text-fg-muted">
                  {report.details ? (
                    <span className="line-clamp-3">{report.details}</span>
                  ) : (
                    <span className="text-fg-subtle italic">Nothing added</span>
                  )}
                </Td>

                <Td className="text-fg-muted">
                  {report.reporterName ?? (
                    <span className="text-fg-subtle italic">Not signed in</span>
                  )}
                </Td>

                <Td className="whitespace-nowrap text-fg-muted">
                  {formatRelative(report.createdAt)}
                </Td>

                <Td>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {report.reviewerName && report.reviewedAt ? (
                    <span className="mt-0.5 block text-xs text-fg-subtle">
                      {report.reviewerName}, {formatDate(report.reviewedAt)}
                    </span>
                  ) : null}
                </Td>

                <Td>
                  {settled ? (
                    <span className="text-xs text-fg-subtle">Closed</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {report.status === 'open' ? (
                        <Button size="sm" variant="ghost" onClick={() => void run('reviewing', report)}>
                          Looking at it
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setTarget({ report, status: 'actioned' });
                          setNote('');
                          setError(null);
                        }}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setTarget({ report, status: 'dismissed' });
                          setNote('');
                          setError(null);
                        }}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            );
          })}
        </AdminTable>
      </div>

      <AdminDialog
        open={target !== null}
        title={
          target?.status === 'actioned'
            ? 'Mark this report resolved?'
            : 'Dismiss this report?'
        }
        description={
          target?.status === 'actioned'
            ? 'Record that the office looked at it and did something. This does not change the advertisement — do that on its own page.'
            : 'Record that the office looked at it and found nothing to act on. The advertisement is left exactly as it is.'
        }
        confirmLabel={target?.status === 'actioned' ? 'Resolve it' : 'Dismiss it'}
        tone={target?.status === 'actioned' ? 'primary' : 'secondary'}
        busy={busy}
        error={error}
        onConfirm={() => {
          if (target) void run(target.status, target.report);
        }}
        onClose={close}
      >
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
            Note for the record
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={500}
            className="mt-2 w-full rounded-sm border border-line-strong bg-surface p-3 text-sm"
          />
          <span className="mt-1 block text-xs text-fg-subtle">
            Internal. The reporter does not see this; it goes into the activity log.
          </span>
        </label>
      </AdminDialog>
    </>
  );
}
