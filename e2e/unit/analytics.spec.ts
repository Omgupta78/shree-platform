import { expect, test } from '@playwright/test';

import {
  REPORTING_TIME_ZONE,
  describeRange,
  previousRange,
  rangeParams,
  resolveRange,
  startOfZonedDay,
  toDateInput,
  zonedParts,
} from '../../src/lib/analytics/range';
import {
  csvField,
  csvFilename,
  csvValue,
  filterRows,
  paginate,
  sortRows,
  toCsv,
  type ReportColumn,
  type ReportRow,
} from '../../src/lib/analytics/report-view';

/**
 * The two pure halves of Phase 11: how a period is worked out, and how a
 * report becomes a file. Both run in Node without a database, because both are
 * arithmetic and string handling rather than queries.
 *
 * What is NOT tested here is whether the figures are right — that is
 * `supabase/test/analytics_checks.sql`, which builds known rows and checks the
 * counting against hand-worked answers. A test of the arithmetic that read it
 * from the same SQL would prove only that the file had not changed.
 */

/* ------------------------------------------------------------ the clock -- */

test.describe('the office day', () => {
  test('a day begins at midnight in Roorkee, not at midnight UTC', () => {
    const start = startOfZonedDay(2026, 9, 23);
    // India is UTC+5:30, so its midnight is the previous 18:30 UTC. The offset
    // is never written into the implementation; this test is what checks that
    // reading it from the zone database produces the right answer.
    expect(start.toISOString()).toBe('2026-09-22T18:30:00.000Z');
  });

  test('an instant just before midnight still belongs to the day before', () => {
    // 18:29 UTC is 23:59 in Roorkee on the 22nd.
    const parts = zonedParts(new Date('2026-09-22T18:29:00.000Z'));
    expect(parts).toEqual({ year: 2026, month: 9, day: 22 });

    // One minute later it is the 23rd there.
    expect(zonedParts(new Date('2026-09-22T18:30:00.000Z'))).toEqual({
      year: 2026,
      month: 9,
      day: 23,
    });
  });

  test('the zone is named rather than an offset being assumed', () => {
    expect(REPORTING_TIME_ZONE).toBe('Asia/Kolkata');
  });
});

/* ------------------------------------------------------------ the ranges -- */

const NOW = new Date('2026-09-23T09:00:00.000Z'); // 14:30 in Roorkee.

/** The two ends of a range, for `describeRange`. */
function boundsOf(range: { from: Date; to: Date }): [Date, Date] {
  return [range.from, range.to];
}

test.describe('resolving a period', () => {
  test('"today" is the office\'s today, and its end is exclusive', () => {
    const range = resolveRange({ preset: 'today' }, NOW);
    expect(range.from.toISOString()).toBe('2026-09-22T18:30:00.000Z');
    expect(range.to.toISOString()).toBe('2026-09-23T18:30:00.000Z');
    // Exactly 24 hours: a day is never counted twice and never half-counted.
    expect(range.to.getTime() - range.from.getTime()).toBe(86_400_000);
  });

  test('"last 7 days" includes today, so it spans eight boundaries', () => {
    const range = resolveRange({ preset: 'last_7' }, NOW);
    expect(toDateInput(range.from)).toBe('2026-09-17');
    expect(range.to.getTime() - range.from.getTime()).toBe(7 * 86_400_000);
  });

  test('"last month" is the whole of the previous month and none of this one', () => {
    const range = resolveRange({ preset: 'last_month' }, NOW);
    expect(toDateInput(range.from)).toBe('2026-08-01');
    // The end is exclusive, so the last moment it covers is 31 August.
    expect(toDateInput(new Date(range.to.getTime() - 1))).toBe('2026-08-31');
  });

  test('a stale or nonsense preset falls back rather than erroring', () => {
    const range = resolveRange({ preset: 'last_fortnight' }, NOW);
    expect(range.preset).toBe('last_30');
  });

  test('a custom range takes the end date as inclusive', () => {
    const range = resolveRange({ preset: 'custom', from: '2026-09-01', to: '2026-09-07' }, NOW);
    expect(toDateInput(range.from)).toBe('2026-09-01');
    expect(toDateInput(new Date(range.to.getTime() - 1))).toBe('2026-09-07');
    expect(range.to.getTime() - range.from.getTime()).toBe(7 * 86_400_000);
  });

  test('a custom range entered backwards is swapped, not refused', () => {
    const range = resolveRange({ preset: 'custom', from: '2026-09-07', to: '2026-09-01' }, NOW);
    expect(toDateInput(range.from)).toBe('2026-09-01');
    expect(toDateInput(new Date(range.to.getTime() - 1))).toBe('2026-09-07');
  });

  test('a custom range with a missing end falls back to the default', () => {
    const range = resolveRange({ preset: 'custom', from: '2026-09-01' }, NOW);
    expect(range.preset).toBe('custom');
    expect(range.to.getTime() - range.from.getTime()).toBe(30 * 86_400_000);
  });

  test('the grain turns monthly only once daily points would be a smear', () => {
    expect(resolveRange({ preset: 'last_90' }, NOW).grain).toBe('day');
    expect(resolveRange({ preset: 'this_year' }, NOW).grain).toBe('month');
  });

  test('the previous period is the same length, ending where this one starts', () => {
    const range = resolveRange({ preset: 'last_7' }, NOW);
    const before = previousRange(range);
    expect(before.to.getTime()).toBe(range.from.getTime());
    expect(before.to.getTime() - before.from.getTime()).toBe(
      range.to.getTime() - range.from.getTime(),
    );
  });

  test('a range survives a round trip through the query string', () => {
    const range = resolveRange({ preset: 'custom', from: '2026-08-11', to: '2026-08-19' }, NOW);
    const params = rangeParams(range);
    const again = resolveRange(
      { preset: params.range, from: params.from, to: params.to },
      NOW,
    );
    expect(again.from.toISOString()).toBe(range.from.toISOString());
    expect(again.to.toISOString()).toBe(range.to.toISOString());
  });

  test('one day is described as one day rather than as a span', () => {
    // Not asserted against a literal: the short month name is "Sep" or "Sept"
    // depending on the ICU data the machine was built with, and a test that
    // pinned one of them would fail on a colleague's laptop for no reason.
    const label = describeRange(...boundsOf(resolveRange({ preset: 'today' }, NOW)));
    expect(label).toContain('23');
    expect(label).toContain('2026');
    expect(label).not.toContain('–');
  });

  test('a span of days is described with both ends', () => {
    const label = describeRange(...boundsOf(resolveRange({ preset: 'last_7' }, NOW)));
    expect(label).toContain('–');
    expect(label).toContain('17');
    // The end is exclusive, so the label must name the 23rd and not the 24th.
    expect(label).toContain('23');
    expect(label).not.toContain('24');
  });
});

/* ------------------------------------------------------------- the table -- */

const COLUMNS: ReportColumn[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'count', label: 'Count', kind: 'number' },
  { key: 'revenue', label: 'Revenue', kind: 'money' },
];

const ROWS: ReportRow[] = [
  { key: 'a', cells: { name: 'Property', count: 12, revenue: 69_800 } },
  { key: 'b', cells: { name: 'Vehicles', count: 3, revenue: 19_900 } },
  { key: 'c', cells: { name: 'Jobs', count: 7, revenue: null } },
];

test.describe('sorting, filtering and paging', () => {
  test('descending puts the largest first', () => {
    expect(sortRows(ROWS, 'count', 'desc').map((r) => r.key)).toEqual(['a', 'c', 'b']);
  });

  test('a missing figure sorts last in BOTH directions', () => {
    // The row with no revenue is not the smallest revenue; it has none. It
    // must not lead an ascending sort as though it were nought.
    expect(sortRows(ROWS, 'revenue', 'asc').map((r) => r.key)).toEqual(['b', 'a', 'c']);
    expect(sortRows(ROWS, 'revenue', 'desc').map((r) => r.key)).toEqual(['a', 'b', 'c']);
  });

  test('text sorts as text', () => {
    expect(sortRows(ROWS, 'name', 'asc').map((r) => r.cells.name)).toEqual([
      'Jobs',
      'Property',
      'Vehicles',
    ]);
  });

  test('sorting does not mutate what it was given', () => {
    const before = ROWS.map((r) => r.key);
    sortRows(ROWS, 'count', 'asc');
    expect(ROWS.map((r) => r.key)).toEqual(before);
  });

  test('the filter matches text and ignores case', () => {
    expect(filterRows(ROWS, COLUMNS, 'veh').map((r) => r.key)).toEqual(['b']);
    expect(filterRows(ROWS, COLUMNS, 'VEH').map((r) => r.key)).toEqual(['b']);
  });

  test('the filter does not match against numbers', () => {
    // "12" is Property's count. Matching it would mean a filter box picked out
    // rows because of digits nobody was searching for.
    expect(filterRows(ROWS, COLUMNS, '12')).toHaveLength(0);
  });

  test('an empty filter keeps everything', () => {
    expect(filterRows(ROWS, COLUMNS, '   ')).toHaveLength(3);
  });

  test('a page past the end lands on the last page rather than on nothing', () => {
    const page = paginate(ROWS, 9, 2);
    expect(page.page).toBe(2);
    expect(page.pageCount).toBe(2);
    expect(page.items).toHaveLength(1);
  });

  test('an empty report still has one page', () => {
    const page = paginate([], 1, 50);
    expect(page.pageCount).toBe(1);
    expect(page.total).toBe(0);
  });
});

/* --------------------------------------------------------------- the CSV -- */

test.describe('the spreadsheet', () => {
  test('money is written in rupees, with no symbol, so it adds up', () => {
    expect(csvValue(69_800, 'money')).toBe('698.00');
    expect(csvValue(1, 'money')).toBe('0.01');
    expect(csvValue(69_800, 'money')).not.toContain('₹');
  });

  test('a percentage is written as the fraction', () => {
    expect(csvValue(0.625, 'percent')).toBe('0.6250');
  });

  test('a missing value is an empty cell, never a zero', () => {
    expect(csvValue(null, 'money')).toBe('');
    expect(csvValue(null, 'number')).toBe('');
  });

  test('commas, quotes and newlines are quoted properly', () => {
    expect(csvField('Roorkee, Haridwar')).toBe('"Roorkee, Haridwar"');
    expect(csvField('He said "no"')).toBe('"He said ""no"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField('plain')).toBe('plain');
  });

  test('a cell that a spreadsheet would run as a formula is made text', () => {
    // Search terms are typed by the public and go into this file verbatim.
    for (const attack of ['=1+1', '+1', '-1', '@SUM(A1)']) {
      const field = csvField(attack);
      expect(field.startsWith("'") || field.startsWith('"\'')).toBe(true);
    }
    expect(csvField('=HYPERLINK("http://x","click")')).toContain("'=HYPERLINK");
  });

  test('a formula that also contains a comma is both neutralised and quoted', () => {
    const field = csvField('=cmd,1');
    expect(field).toBe('"\'=cmd,1"');
  });

  test('a minus sign inside a word is left alone', () => {
    expect(csvField('two-wheeler')).toBe('two-wheeler');
  });

  test('the file carries a header row and CRLF endings', () => {
    const csv = toCsv(COLUMNS, ROWS);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Name,Count,Revenue');
    expect(lines[1]).toBe('Property,12,698.00');
    expect(lines[3]).toBe('Jobs,7,');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  test('the file name says what is in it and over what dates', () => {
    expect(csvFilename('revenue', '2026-09-01', '2026-09-30')).toBe(
      'shree-revenue-2026-09-01-to-2026-09-30.csv',
    );
  });
});
