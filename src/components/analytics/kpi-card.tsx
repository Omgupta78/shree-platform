import type { ReactNode } from 'react';

import { AnalyticsUnavailable } from '@/components/analytics/empty';
import { cn } from '@/lib/utils';

/**
 * One figure, with what it means written under it.
 *
 * `hint` is not decoration. Half the arguments an office has about a number
 * are really arguments about its definition, so each card carries the
 * definition it was computed to — "settled payments only", "decided in this
 * period" — where the number is read rather than in a document nobody opens.
 *
 * `value` of null means the figure genuinely does not exist: nothing was
 * recorded, or the denominator was empty. The card then says so rather than
 * printing a zero that reads as a measurement.
 */

export function KpiCard({
  label,
  value,
  hint,
  delta,
  className,
}: {
  label: string;
  value: string | null;
  hint?: ReactNode;
  /** Change against the previous period of the same length. */
  delta?: Delta | null;
  className?: string;
}) {
  return (
    <div className={cn('rounded-md border border-line bg-surface p-4', className)}>
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">
        {value === null ? <AnalyticsUnavailable /> : value}
      </p>
      {delta ? <DeltaLine delta={delta} /> : null}
      {hint ? <p className="mt-2 text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export interface Delta {
  /** The same measure over the preceding period of equal length. */
  previous: number;
  current: number;
  /** What the previous period was, so the comparison is not a mystery. */
  periodLabel: string;
}

/**
 * The change against the previous period, computed here from two real counts.
 *
 * Never a growth figure invented to look healthy: if the previous period was
 * zero there is no percentage to compute, and the card says what it can — the
 * measure appeared — instead of dividing by nothing and printing ∞% or 100%.
 */
function DeltaLine({ delta }: { delta: Delta }) {
  const { previous, current, periodLabel } = delta;

  if (previous === 0) {
    return (
      <p className="mt-1 text-xs text-fg-subtle">
        {current === 0 ? 'Also nothing' : 'Nothing'} in {periodLabel}
      </p>
    );
  }

  const change = (current - previous) / previous;
  const percent = Math.round(Math.abs(change) * 100);
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'level';

  return (
    <p className="mt-1 text-xs text-fg-subtle">
      {direction === 'level'
        ? 'Unchanged'
        : `${direction === 'up' ? 'Up' : 'Down'} ${percent}%`}{' '}
      against {periodLabel}
    </p>
  );
}
