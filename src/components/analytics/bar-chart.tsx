import { SERIES_ONE } from '@/components/analytics/chart-tokens';
import { AnalyticsEmpty } from '@/components/analytics/empty';
import { cn } from '@/lib/utils';

/**
 * A ranking, as horizontal bars.
 *
 * Horizontal, because the labels are category and town names and a vertical
 * bar chart would set them at forty-five degrees. Horizontal bars read left to
 * right at any length, and the eye compares their ends without trying.
 *
 * One hue for the whole chart. The bars are already distinguished by their
 * labels; colouring each one differently would suggest a grouping that does
 * not exist, and would spend the second series colour on decoration.
 *
 * The value is printed at the end of every bar rather than hidden behind a
 * hover. A figure somebody has to hover to read is a figure nobody reads on a
 * telephone, and this is a page the office opens on a telephone.
 */

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** A second line under the label — a count beside a revenue, say. */
  note?: string;
}

export function BarChart({
  data,
  format,
  emptyMessage = 'No data available for the selected period.',
  className,
}: {
  data: BarDatum[];
  format: (value: number) => string;
  emptyMessage?: string;
  className?: string;
}) {
  if (data.length === 0) return <AnalyticsEmpty message={emptyMessage} />;

  // Against the largest bar, not against the total: this is a comparison of
  // magnitudes, and scaling to the sum would flatten every bar into a sliver
  // as soon as the list grew long.
  const largest = Math.max(...data.map((d) => d.value), 1);

  return (
    <ol className={cn('space-y-3', className)}>
      {data.map((d) => {
        const share = Math.max(d.value / largest, 0);
        return (
          <li key={d.key}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="truncate font-medium">{d.label}</span>
              <span className="shrink-0 tabular-nums text-fg-muted">{format(d.value)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full"
                style={{
                  // A zero-length bar and a missing bar look the same, so a
                  // real zero keeps a hairline: present, and plainly nothing.
                  width: `${Math.max(share * 100, d.value > 0 ? 1.5 : 0)}%`,
                  background: SERIES_ONE,
                }}
              />
            </div>
            {d.note ? <p className="mt-1 text-xs text-fg-subtle">{d.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
