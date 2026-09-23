/**
 * What a report looks like once it is a table: shapes, sorting, filtering,
 * paging, and the CSV.
 *
 * Pure, and free of `server-only`, so the unit tests can exercise it without a
 * database. The definitions themselves live in `reports.ts`, which is server
 * side because loading a report means querying.
 */

export type CellKind = 'text' | 'number' | 'money' | 'date' | 'percent';

export interface ReportColumn {
  key: string;
  label: string;
  kind: CellKind;
}

export interface ReportRow {
  key: string;
  cells: Record<string, string | number | null>;
  /** Where the first column should link, when the row is a thing with a page. */
  href?: string;
}

export type SortDirection = 'asc' | 'desc';

/* -------------------------------------------------------------- sorting -- */

/**
 * Sorts by one column.
 *
 * Nulls always sort last, in both directions. A missing figure is not a small
 * one, and letting it float to the top of a descending sort would put the rows
 * that have no answer above the rows that do.
 */
export function sortRows(
  rows: readonly ReportRow[],
  key: string,
  direction: SortDirection,
): ReportRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a.cells[key] ?? null;
    const right = b.cells[key] ?? null;
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;

    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * sign;
    }
    return String(left).localeCompare(String(right), 'en-IN') * sign;
  });
}

/* ------------------------------------------------------------ filtering -- */

/**
 * Keeps the rows whose text matches.
 *
 * Only the text columns are searched. Matching against numbers would mean
 * "12" picked out a row because its revenue happened to contain those digits,
 * which is not what anybody typing into a filter box wants.
 */
export function filterRows(
  rows: readonly ReportRow[],
  columns: readonly ReportColumn[],
  term: string,
): ReportRow[] {
  const needle = term.trim().toLowerCase();
  if (needle === '') return [...rows];

  const textKeys = columns.filter((c) => c.kind === 'text').map((c) => c.key);
  return rows.filter((r) =>
    textKeys.some((k) => String(r.cells[k] ?? '').toLowerCase().includes(needle)),
  );
}

/* --------------------------------------------------------------- paging -- */

export const REPORT_PAGE_SIZE = 50;

export function paginate<T>(
  rows: readonly T[],
  page: number,
  size = REPORT_PAGE_SIZE,
): { items: T[]; page: number; pageCount: number; total: number } {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  // A page number past the end lands on the last page rather than on nothing:
  // it usually means a filter was narrowed while the reader was on page four.
  const clamped = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (clamped - 1) * size;
  return { items: rows.slice(start, start + size), page: clamped, pageCount, total };
}

/* ------------------------------------------------------------------ CSV -- */

/**
 * One cell, as a spreadsheet should receive it.
 *
 * Money becomes rupees with two decimals and NO currency symbol, because a
 * column of "₹1,234.00" is text and will not add up. Percentages become the
 * fraction rather than "62%", for the same reason. Dates become the ISO
 * instant, which every spreadsheet can parse and which does not depend on the
 * reader's locale putting the month first.
 */
export function csvValue(value: string | number | null, kind: CellKind): string {
  if (value === null || value === undefined) return '';
  switch (kind) {
    case 'money':
      return (Number(value) / 100).toFixed(2);
    case 'percent':
      return Number(value).toFixed(4);
    case 'number':
      return String(Number(value));
    case 'date':
      return String(value);
    case 'text':
    default:
      return String(value);
  }
}

/**
 * Escapes one field.
 *
 * Two separate jobs, and the second is the one that is usually forgotten.
 *
 * The first is ordinary CSV quoting: a field containing a comma, a quote or a
 * newline is wrapped in quotes and its own quotes doubled.
 *
 * The second is formula injection. A spreadsheet treats a cell beginning with
 * `=`, `+`, `-`, `@`, a tab or a carriage return as a formula, and this export
 * carries text that people typed — search terms, advertisement titles. A term
 * beginning `=HYPERLINK(...)` would become a live formula in the office's
 * spreadsheet. Prefixing an apostrophe makes the cell text; the apostrophe is
 * not shown by Excel, LibreOffice or Google Sheets.
 */
export function csvField(value: string): string {
  const dangerous = /^[=+\-@\t\r]/.test(value);
  const text = dangerous ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * The whole file.
 *
 * CRLF line endings, because that is what RFC 4180 says and what Excel on
 * Windows — the machine in the office — expects.
 */
export function toCsv(columns: readonly ReportColumn[], rows: readonly ReportRow[]): string {
  const lines = [columns.map((c) => csvField(c.label)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvField(csvValue(row.cells[c.key] ?? null, c.kind))).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** A file name that says what is in it and over what period. */
export function csvFilename(reportId: string, from: string, to: string): string {
  return `shree-${reportId}-${from}-to-${to}.csv`;
}
