import type { Metadata } from 'next';
import Link from 'next/link';

import {
  AdminEmpty,
  AdminPageHeader,
  AdminPagination,
  AdminPanel,
  AdminTable,
  Td,
  Th,
} from '@/components/admin/admin-ui';
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { AnalyticsEmpty } from '@/components/analytics/empty';
import { Button } from '@/components/ui/button';
import { getStaffMember } from '@/lib/admin/guard';
import type { RawSearchParams } from '@/lib/admin/query';
import { rangeParams, resolveRange, type DateRange } from '@/lib/analytics/range';
import { findReport, reportRates, reportsFor, type ReportDefinition } from '@/lib/analytics/reports';
import {
  REPORT_PAGE_SIZE,
  filterRows,
  paginate,
  sortRows,
  type CellKind,
  type SortDirection,
} from '@/lib/analytics/report-view';
import { formatRate } from '@/lib/analytics/queries';
import { formatDate, formatPaise } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Detailed reports' };

/**
 * The detailed reports.
 *
 * Deliberately NOT at `/admin/reports`. That path is the reader-report queue —
 * what somebody flagged as a fraud or a duplicate — and it was there first.
 * Two quite different things in this office are called a report, and putting
 * the month's revenue where the moderators look for complaints would be a
 * confusion that lasted for years.
 *
 * Every report is one of the definitions in `lib/analytics/reports.ts`, loaded
 * from one SQL function, then sorted, filtered and paged here. Sorting a table
 * of at most a few hundred aggregate rows in the page is honest; what is NOT
 * done anywhere is fetching rows in order to count them.
 *
 * `adminOnly` is checked here, and the export route checks it again, and the
 * database refuses the query regardless. A moderator who edits the report name
 * in the address bar gets the refusal below rather than a table.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const range = resolveRange({
    preset: single(params.range),
    from: single(params.from),
    to: single(params.to),
  });

  const staff = await getStaffMember();
  const isAdmin = staff?.role === 'admin';

  const report = findReport(single(params.report));
  const available = reportsFor(isAdmin);
  const filterTerm = single(params.filter) ?? '';

  return (
    <>
      <AdminPageHeader
        title="Detailed reports"
        description="Each one counted from the rows themselves. Figures can be taken away as a spreadsheet."
        actions={
          <Button href="/admin/analytics" variant="secondary" size="sm">
            Back to analytics
          </Button>
        }
      />

      <nav aria-label="Reports" className="mb-4 flex flex-wrap gap-2">
        {available.map((r) => (
          <Link
            key={r.id}
            href={`/admin/analytics/reports?${new URLSearchParams({ ...rangeParams(range), report: r.id })}`}
            aria-current={r.id === report.id ? 'page' : undefined}
            className={
              r.id === report.id
                ? 'rounded-full bg-primary-solid px-3 py-1.5 text-sm font-medium text-primary-fg'
                : 'rounded-full border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-sunken'
            }
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <DateRangePicker
        range={range}
        keep={{ report: report.id, filter: filterTerm || undefined }}
      />

      <div className="mt-6 space-y-6">
        <RatesLine range={range} isAdmin={isAdmin} />

        {report.adminOnly && !isAdmin ? (
          <AdminPanel title={report.label}>
            <AdminEmpty
              title="That report is the administrator's"
              description="Revenue and account figures are refused to a moderator by the database as well as by this page."
            />
          </AdminPanel>
        ) : (
          <ReportTable
            report={report}
            range={range}
            filterTerm={filterTerm}
            sortKey={single(params.sort) ?? report.defaultSort}
            direction={single(params.dir) === 'asc' ? 'asc' : 'desc'}
            page={Number(single(params.page) ?? '1')}
          />
        )}
      </div>
    </>
  );
}

/* --------------------------------------------------------------- rates -- */

async function RatesLine({ range, isAdmin }: { range: DateRange; isAdmin: boolean }) {
  if (!isAdmin) return null;
  const rates = await reportRates(range);
  if (!rates) return null;

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Rate
        label="Approval rate"
        value={formatRate(rates.approval)}
        hint="Of the decisions made in this period."
      />
      <Rate
        label="Renewal rate"
        value={formatRate(rates.renewal)}
        hint="Of the advertisements whose run ended in this period."
      />
      <Rate
        label="Payments completed"
        value={formatRate(rates.payment)}
        hint="Of the payment attempts started in this period."
      />
    </dl>
  );
}

function Rate({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value}</dd>
      <p className="mt-1 text-xs text-fg-subtle">{hint}</p>
    </div>
  );
}

/* --------------------------------------------------------------- table -- */

async function ReportTable({
  report,
  range,
  filterTerm,
  sortKey,
  direction,
  page,
}: {
  report: ReportDefinition;
  range: DateRange;
  filterTerm: string;
  sortKey: string;
  direction: SortDirection;
  page: number;
}) {
  const loaded = await report.load(range);

  if (loaded === null) {
    return (
      <AdminPanel title={report.label} description={report.description}>
        <div className="p-4">
          <AnalyticsEmpty message="This report could not be read." />
        </div>
      </AdminPanel>
    );
  }

  const columns = report.columns;
  // An unknown sort key — a stale bookmark, a hand-edited address — falls back
  // rather than producing an arbitrary order.
  const key = columns.some((c) => c.key === sortKey) ? sortKey : report.defaultSort;
  const filtered = filterRows(loaded, columns, filterTerm);
  const sorted = sortRows(filtered, key, direction);
  const { items, page: current, pageCount, total } = paginate(sorted, page);

  const base = { ...rangeParams(range), report: report.id };
  const href = (extra: Record<string, string>) =>
    `/admin/analytics/reports?${new URLSearchParams({
      ...base,
      ...(filterTerm ? { filter: filterTerm } : {}),
      sort: key,
      dir: direction,
      ...extra,
    })}`;

  const exportHref = `/admin/analytics/reports/export?${new URLSearchParams({
    ...base,
    ...(filterTerm ? { filter: filterTerm } : {}),
    sort: key,
    dir: direction,
  })}`;

  return (
    <AdminPanel title={report.label} description={report.description}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3">
        <form method="get" className="flex items-end gap-2">
          {Object.entries({ ...base, sort: key, dir: direction }).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Filter</span>
            <input
              type="search"
              name="filter"
              defaultValue={filterTerm}
              placeholder="Part of a name"
              className="h-10 w-48 rounded-sm border border-line-strong bg-surface px-3 text-sm"
            />
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Filter
          </Button>
          {filterTerm ? (
            <Link
              href={href({ page: '1' })}
              className="pb-2 text-sm text-primary hover:underline"
            >
              Clear
            </Link>
          ) : null}
        </form>

        <div className="flex items-center gap-3">
          <span className="text-sm text-fg-muted tabular-nums">
            {total.toLocaleString('en-IN')} {total === 1 ? 'row' : 'rows'}
          </span>
          <Button href={exportHref} variant="secondary" size="sm">
            Download CSV
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <AdminEmpty
          title={filterTerm ? 'Nothing matches that filter' : 'No data for the selected period'}
          description={
            filterTerm
              ? undefined
              : 'Nothing was recorded in these dates. That is the answer, not a failure.'
          }
        />
      ) : (
        <AdminTable
          caption={`${report.label} for ${range.label}`}
          head={
            <>
              {columns.map((column) => {
                const active = column.key === key;
                const next: SortDirection = active && direction === 'desc' ? 'asc' : 'desc';
                return (
                  <Th key={column.key} className={column.kind === 'text' ? '' : 'text-right'}>
                    <Link
                      href={href({ sort: column.key, dir: next, page: '1' })}
                      className="hover:underline"
                      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {column.label}
                      {active ? (direction === 'asc' ? ' ▲' : ' ▼') : ''}
                    </Link>
                  </Th>
                );
              })}
            </>
          }
        >
          {items.map((row) => (
            <tr key={row.key}>
              {columns.map((column, index) => (
                <Td
                  key={column.key}
                  className={column.kind === 'text' ? '' : 'text-right tabular-nums'}
                >
                  {index === 0 && row.href ? (
                    <Link href={row.href} className="font-medium text-primary hover:underline">
                      {cell(row.cells[column.key] ?? null, column.kind)}
                    </Link>
                  ) : (
                    cell(row.cells[column.key] ?? null, column.kind)
                  )}
                </Td>
              ))}
            </tr>
          ))}
        </AdminTable>
      )}

      <AdminPagination page={current} pageCount={pageCount} hrefFor={(p) => href({ page: String(p) })} />

      {report.caveat ? (
        <p className="border-t border-line px-4 py-3 text-xs text-fg-subtle">{report.caveat}</p>
      ) : null}
      <p className="border-t border-line px-4 py-3 text-xs text-fg-subtle">
        {range.label}. Up to {REPORT_PAGE_SIZE} rows to a page; the download carries every row this
        report and filter return.
      </p>
    </AdminPanel>
  );
}

/** One cell, for a person rather than for a spreadsheet. */
function cell(value: string | number | null, kind: CellKind) {
  if (value === null || value === '') return <span className="text-fg-subtle">—</span>;
  switch (kind) {
    case 'money':
      return formatPaise(Number(value));
    case 'percent':
      return `${Math.round(Number(value) * 100)}%`;
    case 'number':
      return Number(value).toLocaleString('en-IN');
    case 'date':
      return formatDate(String(value));
    case 'text':
    default:
      return String(value);
  }
}

function single(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
