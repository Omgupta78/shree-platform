import Link from 'next/link';

import { ExpiryBadge } from '@/components/lifecycle/expiry-badge';
import { formatLongDate, type ExpiryState } from '@/lib/lifecycle/expiry';
import { cn } from '@/lib/utils';

export interface ExpiringSoonItem {
  id: string;
  title: string;
  reference: string;
  expiresAt: string | null;
  state: ExpiryState;
  hasPendingRenewal: boolean;
}

/** The owner's advertisements that are live and close to the end of their run. */
export function ExpiringSoonList({
  items,
  className,
}: {
  items: ExpiringSoonItem[];
  className?: string;
}) {
  return (
    <ul className={cn('divide-y divide-line rounded-md border border-accent-line bg-surface', className)}>
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate font-medium">
              <Link href={`/my-ads/${item.id}`} className="hover:text-primary">
                {item.title}
              </Link>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <span className="font-mono">{item.reference}</span>
              <span>Expires {formatLongDate(item.expiresAt)}</span>
              <ExpiryBadge state={item.state} />
            </p>
          </div>
          {item.hasPendingRenewal ? (
            <span className="text-sm text-fg-muted">Renewal with our office</span>
          ) : (
            <Link
              href={`/my-ads/${item.id}/renew`}
              className="inline-flex h-9 items-center rounded-sm bg-primary-solid px-3 text-sm font-medium text-primary-fg hover:bg-primary-solid-hover"
            >
              Renew Advertisement
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
