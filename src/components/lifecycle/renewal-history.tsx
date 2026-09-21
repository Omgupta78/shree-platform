import { Badge, type BadgeTone } from '@/components/ui/badge';
import type { MyRenewal } from '@/lib/data/my-ads';
import { formatLongDate } from '@/lib/lifecycle/expiry';

const STATUS: Record<MyRenewal['status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'With our office', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Not approved', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};

/**
 * Every renewal of this advertisement, newest first, straight from
 * `ad_renewals`. Nothing is inferred and nothing is filled in: a renewal that
 * has not been decided shows no decision date and no new expiry.
 */
export function RenewalHistory({ renewals }: { renewals: MyRenewal[] }) {
  if (!renewals.length) {
    return <p className="text-sm text-fg-muted">No renewal history yet.</p>;
  }

  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0 relative">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">Renewal history</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-muted">
            <th scope="col" className="px-3 py-2 font-semibold">Renewal</th>
            <th scope="col" className="px-3 py-2 font-semibold">Requested</th>
            <th scope="col" className="px-3 py-2 font-semibold">Previous expiry</th>
            <th scope="col" className="px-3 py-2 font-semibold">Status</th>
            <th scope="col" className="px-3 py-2 font-semibold">Approved</th>
            <th scope="col" className="px-3 py-2 font-semibold">New expiry</th>
          </tr>
        </thead>
        <tbody>
          {renewals.map((renewal) => {
            const status = STATUS[renewal.status];
            return (
              <tr key={renewal.id} className="border-b border-line align-top">
                <td className="px-3 py-2.5 tabular-nums">#{renewal.renewalNumber}</td>
                <td className="px-3 py-2.5">{formatLongDate(renewal.requestedAt)}</td>
                <td className="px-3 py-2.5">{formatLongDate(renewal.previousExpiresAt) || '—'}</td>
                <td className="px-3 py-2.5">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {renewal.status === 'rejected' && renewal.decisionNote ? (
                    <span className="mt-1 block text-xs text-fg-muted">{renewal.decisionNote}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  {renewal.status === 'approved' ? formatLongDate(renewal.decidedAt) : '—'}
                </td>
                <td className="px-3 py-2.5">
                  {renewal.status === 'approved' ? formatLongDate(renewal.newExpiresAt) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
