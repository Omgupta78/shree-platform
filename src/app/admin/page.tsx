import type { Metadata } from 'next';
import Link from 'next/link';

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  StatusBadge,
  Td,
  Th,
} from '@/components/admin/admin-ui';
import { Badge } from '@/components/ui/badge';
import { buildNotices, getDashboardCounts, getRecentSubmissions } from '@/lib/admin/dashboard';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * The dashboard.
 *
 * Two questions, in the order somebody actually asks them: what needs doing,
 * and what has just come in. Everything else a dashboard usually carries —
 * trends, totals for their own sake — is a graph nobody acts on, and this one
 * is the first screen of a working day.
 */
export default async function AdminDashboardPage() {
  const [counts, recent] = await Promise.all([getDashboardCounts(), getRecentSubmissions()]);
  const notices = buildNotices(counts);

  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        description="What is waiting, and what has just arrived."
      />

      <div className="space-y-3" role="status">
        {notices.map((notice) => (
          <Link
            key={notice.id}
            href={notice.href}
            className={cn(
              'flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm transition-colors',
              notice.tone === 'urgent' &&
                'border-critical-line bg-critical-surface text-critical-fg hover:brightness-95',
              notice.tone === 'attention' &&
                'border-accent-line bg-accent-surface text-accent-fg hover:brightness-95',
              notice.tone === 'calm' && 'border-line bg-surface text-fg-muted hover:bg-surface-sunken',
            )}
          >
            <span className="font-medium">{notice.message}</span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        {counts ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Pending" value={counts.pending} href="/admin/advertisements/pending" emphasis />
            <Stat
              label="Changes requested"
              value={counts.changes_requested}
              href="/admin/advertisements/changes-requested"
            />
            <Stat label="Approved" value={counts.approved} href="/admin/advertisements/approved" />
            <Stat label="Rejected" value={counts.rejected} href="/admin/advertisements/rejected" />
            <Stat label="Expired" value={counts.expired} href="/admin/advertisements/expired" />
            <Stat label="Expiring soon" value={counts.expiring_soon} href="/admin/advertisements/expiring" />
            <Stat label="Renewals waiting" value={counts.renewals_pending} href="/admin/advertisements/renewals" emphasis />
            <Stat label="Total users" value={counts.users} href="/admin/users" />
            <Stat label="Today’s submissions" value={counts.submitted_today} href="/admin/advertisements?period=1" />
          </dl>
        ) : (
          <AdminEmpty
            title="The figures could not be read"
            description="The dashboard counts come straight from the database, and that call did not answer. Nothing here is a guess, so nothing is shown."
          />
        )}
      </div>

      <div className="mt-8">
        <AdminPanel
          title="Recent submissions"
          description="The last eight advertisements to arrive, whatever state they are in."
        >
          {recent.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-fg-muted">
              Nothing has been submitted yet.
            </div>
          ) : (
            <AdminTable
              caption="Recent submissions"
              head={
                <>
                  <Th className="w-28">Reference</Th>
                  <Th>Title</Th>
                  <Th className="w-40">Category</Th>
                  <Th className="w-40">Advertiser</Th>
                  <Th className="w-32">Sent</Th>
                  <Th className="w-36">Status</Th>
                  <Th className="w-20"><span className="sr-only">Action</span></Th>
                </>
              }
            >
              {recent.map((row) => (
                <tr key={row.id} className="hover:bg-surface-sunken">
                  <Td className="font-mono text-xs whitespace-nowrap">{row.reference}</Td>
                  <Td>
                    <span className="line-clamp-2">{row.title}</span>
                    {row.kind === 'display' ? (
                      <Badge className="mt-1">Display</Badge>
                    ) : null}
                  </Td>
                  <Td className="text-fg-muted">{row.categoryName ?? '—'}</Td>
                  <Td className="text-fg-muted">{row.advertiserName}</Td>
                  <Td className="whitespace-nowrap text-fg-muted">{formatRelative(row.createdAt)}</Td>
                  <Td><StatusBadge status={row.status} /></Td>
                  <Td>
                    <Link
                      href={`/admin/advertisements/${row.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      View
                    </Link>
                  </Td>
                </tr>
              ))}
            </AdminTable>
          )}
        </AdminPanel>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  href,
  emphasis,
}: {
  label: string;
  value: number;
  href: string;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-md border bg-surface px-4 py-3 transition-colors hover:border-fg-subtle',
        emphasis && value > 0 ? 'border-accent-line' : 'border-line',
      )}
    >
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 font-serif text-2xl font-semibold tabular-nums">{value}</dd>
    </Link>
  );
}
