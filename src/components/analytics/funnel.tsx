import { SERIES_ONE } from '@/components/analytics/chart-tokens';
import type { Funnel } from '@/lib/analytics/queries';

/**
 * The five things people do, counted side by side.
 *
 * Deliberately NOT a conversion funnel, and deliberately without a percentage
 * between the steps.
 *
 * Each figure is the number of distinct people who did that thing inside the
 * chosen period. They are not one cohort followed through: somebody who posted
 * in September may well have registered in March, and somebody who registered
 * in September may post in November. Dividing "posted" by "registered" would
 * therefore produce a ratio of two different populations — a conversion rate
 * that is arithmetically valid and factually meaningless, and the kind of
 * figure that ends up in a plan.
 *
 * Measuring real conversion means following registration cohorts forward, and
 * that is a different query than this one. Until it exists, the bars are
 * counts, scaled against the largest, and the note under them says what they
 * are.
 */

const STAGES: Array<{ key: keyof Funnel; label: string; hint: string }> = [
  { key: 'registered', label: 'Registered', hint: 'Accounts created in this period' },
  { key: 'posted', label: 'Posted an advertisement', hint: 'People who submitted at least one' },
  { key: 'paid', label: 'Paid', hint: 'People with at least one settled payment' },
  { key: 'published', label: 'Had one published', hint: 'People whose advertisement went live' },
  { key: 'renewed', label: 'Asked to renew', hint: 'People who requested a renewal' },
];

export function FunnelPanel({ funnel }: { funnel: Funnel }) {
  const largest = Math.max(...STAGES.map((s) => funnel[s.key]), 1);

  return (
    <div>
      <ol className="space-y-3">
        {STAGES.map((stage) => {
          const value = funnel[stage.key];
          return (
            <li key={stage.key}>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="font-medium">{stage.label}</span>
                <span className="shrink-0 tabular-nums text-fg-muted">
                  {value.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max((value / largest) * 100, value > 0 ? 1.5 : 0)}%`,
                    background: SERIES_ONE,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-fg-subtle">{stage.hint}</p>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 rounded-sm bg-surface-sunken px-3 py-2 text-xs text-fg-muted">
        Each figure counts the distinct people who did that thing during the selected period. They
        are not the same group followed from one step to the next, so the steps should not be
        divided into one another to produce a conversion rate.
      </p>
    </div>
  );
}
