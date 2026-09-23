import { Button } from '@/components/ui/button';
import { RANGE_OPTIONS, toDateInput, type DateRange } from '@/lib/analytics/range';

/**
 * Choosing the period.
 *
 * A plain GET form, submitted to the page it sits on. No client component, no
 * router push, no JavaScript: the selection lives entirely in the query string,
 * which means a period somebody is looking at can be copied out of the address
 * bar and sent to a colleague, and the page still works on a connection that
 * dropped the bundle.
 *
 * `keep` carries the parameters that are not the range — which report, which
 * column it is sorted by — through the submission as hidden fields, so
 * changing the dates does not quietly reset everything else. The page number
 * is deliberately NOT carried: a new period is a new result set, and staying
 * on page 7 of it would land on an empty table.
 */

const CONTROL =
  'h-11 rounded-sm border border-line-strong bg-surface px-3 text-base sm:text-[0.9375rem] ' +
  'text-fg transition-colors hover:border-fg-subtle';

export function DateRangePicker({
  range,
  keep = {},
  className,
}: {
  range: DateRange;
  keep?: Record<string, string | undefined>;
  className?: string;
}) {
  const from = toDateInput(range.from);
  // The end is exclusive in the range and inclusive to the person reading it.
  const to = toDateInput(new Date(range.to.getTime() - 1));

  return (
    <form
      method="get"
      className={
        className ??
        'flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface px-4 py-3'
      }
    >
      {Object.entries(keep).map(([name, value]) =>
        value === undefined || name === 'page' ? null : (
          <input key={name} type="hidden" name={name} value={value} />
        ),
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Period</span>
        <select
          name="range"
          defaultValue={range.preset}
          className={CONTROL}
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {/*
        The two dates are always present rather than revealed by the select,
        because revealing them would need JavaScript and somebody choosing
        "Custom range" would then be looking at a form with nowhere to type.
      */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">From</span>
        <input
          type="date"
          name="from"
          defaultValue={from}
          className={CONTROL}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">To</span>
        <input
          type="date"
          name="to"
          defaultValue={to}
          className={CONTROL}
        />
      </label>

      <Button type="submit">Apply</Button>

      <p className="w-full text-xs text-fg-subtle sm:w-auto sm:self-center">
        Showing {range.label}. Dates are the office&rsquo;s own day, in India Standard Time. Choose
        &ldquo;Custom range&rdquo; for the two dates above to be used.
      </p>
    </form>
  );
}
