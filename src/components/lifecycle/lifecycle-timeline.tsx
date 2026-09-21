import { formatLongDate } from '@/lib/lifecycle/expiry';
import { cn } from '@/lib/utils';

export interface TimelineEvent {
  key: string;
  label: string;
  at: string | null;
  detail?: string | null;
  /** A date in the future — shown, but marked as not yet reached. */
  upcoming?: boolean;
}

/**
 * A vertical list of what has happened to an advertisement. Purely
 * presentational: the page decides which events exist, from real dates only.
 */
export function LifecycleTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return null;
  return (
    <ol className="space-y-3 border-l border-line pl-4">
      {events.map((event) => (
        <li key={event.key} className="relative">
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-1.5 -left-[1.3rem] h-2 w-2 rounded-full',
              event.upcoming ? 'border border-line-strong bg-surface' : 'bg-fg-muted',
            )}
          />
          <p className="text-sm font-medium">
            {event.label}
            {event.upcoming ? <span className="ml-1 font-normal text-fg-subtle">(scheduled)</span> : null}
          </p>
          {event.at ? <p className="text-xs text-fg-muted">{formatLongDate(event.at)}</p> : null}
          {event.detail ? <p className="mt-0.5 text-xs text-fg-muted">{event.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}
