import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminEmpty, AdminPageHeader, AdminPanel } from '@/components/admin/admin-ui';
import { Badge } from '@/components/ui/badge';
import { ACTION_COPY, EVENT_COPY, getActivity } from '@/lib/admin/office';
import { formatDate, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { RawSearchParams } from '@/lib/admin/query';

export const metadata: Metadata = { title: 'Activity log' };

const FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'advertisement', label: 'Advertisements' },
  { value: 'report', label: 'Reports' },
  { value: 'profile', label: 'Accounts' },
  { value: 'payment', label: 'Payments' },
] as const;

/**
 * Who decided what, and when.
 *
 * Read from `admin_actions`, a view over the audit log. The log itself is
 * append-only in the database — UPDATE and DELETE are revoked and a trigger
 * raises on either — so this page cannot be made to show a tidier version of
 * events than the one that happened. That is the whole point of it: an office
 * that publishes other people's advertisements has to be able to answer for a
 * decision months later.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.entity) ? params.entity[0] : params.entity;
  const entity = FILTERS.some((filter) => filter.value === raw && raw) ? raw : undefined;

  const entries = await getActivity(150, entity);

  return (
    <>
      <AdminPageHeader
        title="Activity log"
        description="Every moderation decision, in order. Append-only: nothing here can be edited or removed, including by an administrator."
        count={entries.length}
      />

      <nav aria-label="Filter the log" className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((filter) => (
          <Link
            key={filter.label}
            href={filter.value ? `/admin/activity?entity=${filter.value}` : '/admin/activity'}
            aria-current={(entity ?? '') === filter.value ? 'page' : undefined}
            className={cn(
              'rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
              (entity ?? '') === filter.value
                ? 'bg-fg text-canvas'
                : 'text-fg-muted hover:bg-surface-sunken',
            )}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <AdminEmpty title="Nothing recorded yet" />
      ) : (
        <AdminPanel>
          <ol className="divide-y divide-line">
            {entries.map((entry) => (
              <li key={entry.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium">{entry.actorName ?? 'The system'}</span>
                  {entry.actorRole && entry.actorRole !== 'user' ? (
                    <Badge tone="featured">{entry.actorRole}</Badge>
                  ) : null}
                  <span className="text-fg-muted">
                    {(entry.event && EVENT_COPY[entry.event]) ?? ACTION_COPY[entry.action] ?? entry.action}
                  </span>
                  {entry.adReference ? (
                    <Link
                      href={`/admin/advertisements/${entry.entityId}`}
                      className="font-mono text-xs font-medium text-primary hover:underline"
                    >
                      {entry.adReference}
                    </Link>
                  ) : null}
                  {entry.previousStatus && entry.newStatus ? (
                    <span className="text-xs text-fg-subtle">
                      {entry.previousStatus} → {entry.newStatus}
                    </span>
                  ) : null}
                </div>

                {entry.adTitle ? (
                  <p className="mt-0.5 truncate text-sm text-fg-muted">{entry.adTitle}</p>
                ) : null}
                {entry.note ? (
                  <p className="mt-1 text-sm text-fg-muted">&ldquo;{entry.note}&rdquo;</p>
                ) : null}

                <p className="mt-1 text-xs text-fg-subtle">
                  {formatDate(entry.occurredAt)} · {formatRelative(entry.occurredAt)}
                </p>
              </li>
            ))}
          </ol>
        </AdminPanel>
      )}
    </>
  );
}
