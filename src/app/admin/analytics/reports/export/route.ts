import { NextResponse } from 'next/server';

import { getStaffMember } from '@/lib/admin/guard';
import { resolveRange, toDateInput } from '@/lib/analytics/range';
import { findReport } from '@/lib/analytics/reports';
import { csvFilename, filterRows, sortRows, toCsv } from '@/lib/analytics/report-view';
import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * A report, as a spreadsheet.
 *
 * Four things this route does that a download link usually does not:
 *
 * It checks who is asking, here, on the server. `/admin` is behind the proxy
 * and behind the layout's check, but a route handler is not a page and does
 * not render inside the layout — so it does its own, and refuses with 403
 * rather than redirecting, because the caller is a download and not a person
 * reading a page.
 *
 * It checks the report's own restriction again. A moderator who copies an
 * administrator's export link gets the refusal, not the file. Underneath both
 * checks the database refuses the query regardless.
 *
 * It writes down that the export happened, before sending it. Who took what,
 * over which dates, and how many rows.
 *
 * And it sends every row the report and filter return — not the page the
 * reader happened to be looking at. A spreadsheet of fifty rows out of four
 * hundred, with nothing to say so, is how a figure ends up in a plan.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const staff = await getStaffMember();
  if (!staff) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const report = findReport(url.searchParams.get('report'));

  if (report.adminOnly && staff.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const range = resolveRange({
    preset: url.searchParams.get('range'),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
  });

  const loaded = await report.load(range);
  if (loaded === null) {
    return NextResponse.json({ error: 'report unavailable' }, { status: 502 });
  }

  const filtered = filterRows(loaded, report.columns, url.searchParams.get('filter') ?? '');
  const sortKey = url.searchParams.get('sort');
  const key = report.columns.some((c) => c.key === sortKey) ? (sortKey as string) : report.defaultSort;
  const rows = sortRows(filtered, key, url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc');

  // Written before the file is handed over, and a failure to write it does not
  // stop the download: a missing line in the trail is worth knowing about in
  // the log, and is not worth refusing an administrator their own figures.
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc('log_report_export', {
      p_report: report.id,
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
      p_rows: rows.length,
    });
    if (error) console.error('log_report_export failed', error.message);
  } catch (error) {
    console.error('log_report_export threw', error instanceof Error ? error.message : error);
  }

  const filename = csvFilename(
    report.id,
    toDateInput(range.from),
    toDateInput(new Date(range.to.getTime() - 1)),
  );

  return new NextResponse(toCsv(report.columns, rows), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // A report is a snapshot of a moment. Nothing between here and the
      // office may keep a copy of somebody's revenue figures.
      'Cache-Control': 'no-store, private',
    },
  });
}
