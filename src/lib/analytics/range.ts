/**
 * Date ranges, in the office's own day.
 *
 * "Today" means today in Roorkee, and a figure for today that silently began
 * at half past five yesterday evening is wrong in a way nobody notices until
 * they reconcile a month against a bank statement.
 *
 * The offset is never written down here. It is read from the IANA database
 * through `Intl`, at the instant in question — which is the difference between
 * code that is correct and code that happens to be correct for a country with
 * no daylight saving. India has none today; the technique does not depend on
 * that staying true, and does not have to be revisited if the office ever
 * reports on a second city.
 *
 * Pure, and free of `server-only`: the picker renders the labels in the
 * browser and the queries use the boundaries on the server, so both read this.
 */

export const REPORTING_TIME_ZONE = 'Asia/Kolkata';

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7'
  | 'last_30'
  | 'last_90'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom';

export interface DateRange {
  preset: RangePreset;
  /** Inclusive start, as an instant. */
  from: Date;
  /** EXCLUSIVE end. Every query is `>= from and < to`, so a day is never counted twice. */
  to: Date;
  label: string;
  /** 'day' under roughly three months, 'month' beyond it. */
  grain: 'day' | 'month';
}

export const RANGE_OPTIONS: ReadonlyArray<{ value: RangePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];

/* ----------------------------------------------------------- the clock -- */

/**
 * How far the zone is from UTC at a given instant, according to the zone
 * database. Formatting the instant in the zone and reading it back as though
 * it were UTC gives the offset without anybody typing "5.5".
 */
function zoneOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORTING_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // `hour` comes back as 24 at midnight under hour12: false in some engines.
  const hour = get('hour') % 24;

  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asIfUtc - at.getTime();
}

/** The calendar date in the reporting zone, as {year, month, day}. */
export function zonedParts(at: Date): { year: number; month: number; day: number } {
  const text = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORTING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  const [year, month, day] = text.split('-').map(Number);
  return { year: year as number, month: month as number, day: day as number };
}

/**
 * The instant at which a given calendar day begins in the reporting zone.
 *
 * Guess the instant as though the zone were UTC, ask the zone database what
 * the offset is around then, and correct. One iteration is enough for every
 * real zone.
 */
export function startOfZonedDay(year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const corrected = guess - zoneOffsetMs(new Date(guess));
  return new Date(corrected);
}

function addDays(at: Date, days: number): Date {
  const { year, month, day } = zonedParts(at);
  return startOfZonedDay(year, month, day + days);
}

/* ---------------------------------------------------------- the ranges -- */

const DAY_LABEL = new Intl.DateTimeFormat('en-IN', {
  timeZone: REPORTING_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "21 Sep 2026", or "1 Sep 2026 – 21 Sep 2026" for a range of days. */
export function describeRange(from: Date, to: Date): string {
  // `to` is exclusive, so the last day it covers is the one before it.
  const lastDay = new Date(to.getTime() - 1);
  const start = DAY_LABEL.format(from);
  const end = DAY_LABEL.format(lastDay);
  return start === end ? start : `${start} – ${end}`;
}

/** `YYYY-MM-DD` in the reporting zone, for a date input. */
export function toDateInput(at: Date): string {
  const { year, month, day } = zonedParts(at);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function grainFor(from: Date, to: Date): 'day' | 'month' {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  // Ninety daily points is a readable chart; three years of them is a smear.
  return days > 95 ? 'month' : 'day';
}

/**
 * Turns what the URL says into a range.
 *
 * Anything unrecognised becomes the default rather than an error: a dashboard
 * is a place somebody arrives at from a stale bookmark, and a 400 helps
 * nobody. A custom range with its ends the wrong way round is swapped rather
 * than refused, because that is plainly what was meant.
 */
export function resolveRange(
  input: { preset?: string | null; from?: string | null; to?: string | null },
  now: Date = new Date(),
): DateRange {
  const today = (() => {
    const { year, month, day } = zonedParts(now);
    return startOfZonedDay(year, month, day);
  })();
  const tomorrow = addDays(today, 1);

  const preset = (RANGE_OPTIONS.find((o) => o.value === input.preset)?.value ??
    'last_30') as RangePreset;

  let from: Date;
  let to: Date;

  switch (preset) {
    case 'today':
      from = today;
      to = tomorrow;
      break;
    case 'yesterday':
      from = addDays(today, -1);
      to = today;
      break;
    case 'last_7':
      from = addDays(today, -6);
      to = tomorrow;
      break;
    case 'last_90':
      from = addDays(today, -89);
      to = tomorrow;
      break;
    case 'this_month': {
      const { year, month } = zonedParts(now);
      from = startOfZonedDay(year, month, 1);
      to = tomorrow;
      break;
    }
    case 'last_month': {
      const { year, month } = zonedParts(now);
      from = startOfZonedDay(year, month - 1, 1);
      to = startOfZonedDay(year, month, 1);
      break;
    }
    case 'this_year': {
      const { year } = zonedParts(now);
      from = startOfZonedDay(year, 1, 1);
      to = tomorrow;
      break;
    }
    case 'custom': {
      const parsed = parseCustom(input.from, input.to);
      if (!parsed) {
        // Not a usable pair. Fall back rather than refuse.
        from = addDays(today, -29);
        to = tomorrow;
        break;
      }
      from = parsed.from;
      to = parsed.to;
      break;
    }
    case 'last_30':
    default:
      from = addDays(today, -29);
      to = tomorrow;
      break;
  }

  return { preset, from, to, label: describeRange(from, to), grain: grainFor(from, to) };
}

function parseCustom(
  rawFrom: string | null | undefined,
  rawTo: string | null | undefined,
): { from: Date; to: Date } | null {
  const shape = /^\d{4}-\d{2}-\d{2}$/;
  if (!rawFrom || !rawTo || !shape.test(rawFrom) || !shape.test(rawTo)) return null;

  const [fy, fm, fd] = rawFrom.split('-').map(Number);
  const [ty, tm, td] = rawTo.split('-').map(Number);

  let from = startOfZonedDay(fy as number, fm as number, fd as number);
  // The end is inclusive to the person who typed it and exclusive to the
  // query, so the day after the one they chose.
  let to = startOfZonedDay(ty as number, tm as number, (td as number) + 1);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (to <= from) {
    // Plainly the ends were entered the wrong way round.
    const swapFrom = startOfZonedDay(ty as number, tm as number, td as number);
    const swapTo = startOfZonedDay(fy as number, fm as number, (fd as number) + 1);
    from = swapFrom;
    to = swapTo;
  }
  return { from, to };
}

/** The same range, one period earlier — for "compared with the period before". */
export function previousRange(range: DateRange): { from: Date; to: Date } {
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span), to: range.from };
}

/** Puts a range back into query parameters, so links keep the selection. */
export function rangeParams(range: DateRange): Record<string, string> {
  if (range.preset !== 'custom') return { range: range.preset };
  return {
    range: 'custom',
    from: toDateInput(range.from),
    to: toDateInput(new Date(range.to.getTime() - 1)),
  };
}
