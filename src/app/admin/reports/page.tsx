import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminPageHeader } from '@/components/admin/admin-ui';
import { ReportTable } from '@/components/admin/report-table';
import { getReports } from '@/lib/admin/office';
import { cn } from '@/lib/utils';
import type { ReportStatus } from '@/types/database';
import type { RawSearchParams } from '@/lib/admin/query';

export const metadata: Metadata = { title: 'Reports' };

const TABS: ReadonlyArray<{ value: ReportStatus | 'all'; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'reviewing', label: 'Being looked at' },
  { value: 'actioned', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'Everything' },
];

function parseStatus(value: string | string[] | undefined): ReportStatus | 'all' {
  const raw = Array.isArray(value) ? value[0] : value;
  const found = TABS.find((tab) => tab.value === raw);
  return found?.value ?? 'open';
}

/**
 * What readers have flagged.
 *
 * A report never changes an advertisement on its own, and nothing on this page
 * can. Ten people reporting a vacancy they did not get is not evidence of
 * anything, and an automatic takedown would be a stranger's veto over somebody
 * who paid for the advertisement. Somebody reads it, goes and looks, and
 * decides on the advertisement's own page.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const reports = await getReports(status);

  return (
    <>
      <AdminPageHeader
        title="Reports"
        description="Advertisements readers have flagged. Nothing here changes an advertisement — that is decided on its own page."
        count={reports.length}
      />

      <nav aria-label="Report status" className="mb-4 flex flex-wrap gap-1">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === 'open' ? '/admin/reports' : `/admin/reports?status=${tab.value}`}
            aria-current={status === tab.value ? 'page' : undefined}
            className={cn(
              'rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
              status === tab.value
                ? 'bg-fg text-canvas'
                : 'text-fg-muted hover:bg-surface-sunken',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <ReportTable reports={reports} />
    </>
  );
}
