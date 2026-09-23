import { cn } from '@/lib/utils';

/**
 * What a chart or table shows when the query came back with nothing.
 *
 * There are two different nothings here and they must not look the same.
 *
 * `AnalyticsEmpty` means "we record this, and in the period you chose it did
 * not happen". Zero revenue in a quiet week is a real, true figure.
 *
 * `AnalyticsUntracked` means "we do not record this at all". A dashboard that
 * answers that question with ₹0 or a flat line is not empty, it is lying: the
 * reader takes it as a measurement and plans against it. So it says plainly
 * that the number does not exist yet, and what would have to be built for it
 * to exist.
 */

export function AnalyticsEmpty({
  message = 'No data available for the selected period.',
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[140px] items-center justify-center rounded-sm border border-dashed border-line px-6 py-10 text-center',
        className,
      )}
    >
      <p className="text-sm text-fg-muted">{message}</p>
    </div>
  );
}

export function AnalyticsUntracked({
  metric,
  reason,
  className,
}: {
  /** The thing that is not measured, named as the reader would name it. */
  metric: string;
  /** What would have to be recorded first. Kept short and concrete. */
  reason?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-sm border border-dashed border-line bg-surface-sunken px-5 py-6',
        className,
      )}
    >
      <p className="text-sm font-medium">{metric}: data not available yet</p>
      {reason ? <p className="mt-1.5 text-sm text-fg-muted">{reason}</p> : null}
    </div>
  );
}

/** A single figure that is not measured, sized to sit in a row of KPI cards. */
export function AnalyticsUnavailable({ className }: { className?: string }) {
  return (
    <span className={cn('text-sm font-normal text-fg-subtle', className)}>
      Data not available yet
    </span>
  );
}
