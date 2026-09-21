'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { bulkModerateAction } from '@/app/admin/actions';
import { AdminDialog, ReasonPicker, composeNote } from '@/components/admin/dialog';
import {
  AdminEmpty,
  AdminPagination,
  AdminTable,
  StatusBadge,
  Td,
  Th,
  WaitingFor,
} from '@/components/admin/admin-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MAX_NOTE, REJECTION_REASONS } from '@/lib/admin/moderation';
import type { QueueAdvertisement } from '@/lib/admin/advertisements';
import { formatDate, formatRelative } from '@/lib/format';

export type QueueContext = 'queue' | 'approved' | 'rejected' | 'expired' | 'all';

/**
 * One date column, whose meaning depends on the list.
 *
 * In the review queue the useful date is when it arrived and how long it has
 * waited; on the live list, when it ends; on the rejected list, when somebody
 * refused it; on the finished list, when it ran out. Five columns of which four
 * are blank on any given page would be worse.
 */
const WHEN_HEADING: Record<QueueContext, string> = {
  queue: 'Submitted',
  approved: 'Runs until',
  rejected: 'Rejected',
  expired: 'Published · Expired',
  all: 'Submitted',
};

function When({ item, context }: { item: QueueAdvertisement; context: QueueContext }) {
  if (context === 'approved') {
    return <span className="text-fg-muted">{formatDate(item.expiresAt)}</span>;
  }
  if (context === 'expired') {
    return (
      <>
        <span className="block text-xs text-fg-subtle">{formatDate(item.publishedAt) || '—'}</span>
        <span className="block text-fg-muted">{formatDate(item.expiresAt)}</span>
      </>
    );
  }
  if (context === 'rejected') {
    return (
      <span className="text-fg-muted">
        {item.lastDecisionAt ? formatDate(item.lastDecisionAt) : '—'}
      </span>
    );
  }
  return (
    <>
      <span className="block text-fg-muted">{formatDate(item.createdAt)}</span>
      {context === 'queue' ? (
        <span className="block text-xs">
          <WaitingFor hours={item.hoursWaiting} />
        </span>
      ) : (
        <span className="block text-xs text-fg-subtle">{formatRelative(item.createdAt)}</span>
      )}
    </>
  );
}

/**
 * The queue.
 *
 * One table for every status page — the rows are the same, and five
 * near-identical tables is how two of them end up missing a column somebody
 * relies on.
 *
 * There is no Approve button in the row. A decision made from a list is a
 * decision made without reading the advertisement, and the whole job of this
 * screen is to get somebody to the review page. Bulk approval exists for the
 * case where they have already read them, and is deliberately a few more
 * clicks.
 */
export function QueueTable({
  items,
  total,
  page,
  pageCount,
  basePath,
  pageQuery,
  allowBulk,
  context = 'all',
  emptyTitle,
  emptyDescription,
}: {
  items: QueueAdvertisement[];
  total: number;
  page: number;
  pageCount: number;
  /** Where the pager points, and the query it must preserve. A function cannot
   *  be handed to a Client Component, so the two halves are passed instead. */
  basePath: string;
  pageQuery: string;
  allowBulk: boolean;
  /** Which queue this is — decides what the date column means. */
  context?: QueueContext;
  emptyTitle: string;
  emptyDescription?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return <AdminEmpty title={emptyTitle} description={emptyDescription} />;
  }

  const hrefForPage = (next: number) => {
    const params = new URLSearchParams(pageQuery);
    if (next > 1) params.set('page', String(next));
    else params.delete('page');
    const search = params.toString();
    return search ? `${basePath}?${search}` : basePath;
  };

  const allOnPage = items.map((item) => item.id);
  const allSelected = selected.size > 0 && allOnPage.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) =>
      allOnPage.every((id) => current.has(id)) ? new Set() : new Set(allOnPage),
    );
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setChoice('');
    setNote('');
    setError(null);
  }

  async function runBulk() {
    if (!dialog) return;
    setBusy(true);
    setError(null);

    const result = await bulkModerateAction({
      advertisementIds: [...selected],
      action: dialog,
      note: dialog === 'reject' ? composeNote(choice, note) : '',
    });

    setBusy(false);

    if (!result.ok) {
      const detail = result.failures
        ?.map((failure) => `${failure.reference}: ${failure.message}`)
        .join(' · ');
      setError(detail ? `${result.message ?? ''} ${detail}`.trim() : (result.message ?? 'That did not work.'));
      // Whatever did go through should leave the list, so refresh regardless.
      router.refresh();
      return;
    }

    setDialog(null);
    setSelected(new Set());
    setChoice('');
    setNote('');
    router.refresh();
  }

  const composed = composeNote(choice, note);

  return (
    <div className="rounded-md border border-line bg-surface">
      {allowBulk && selected.size > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 border-b border-line bg-accent-surface px-4 py-2.5 text-sm text-accent-fg"
        >
          <span className="font-medium tabular-nums">
            {selected.size} selected
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setDialog('approve')}>
              Approve selected
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="border-critical-line text-critical-fg"
              onClick={() => setDialog('reject')}
            >
              Reject selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <AdminTable
        caption={`${total} advertisements`}
        head={
          <>
            {allowBulk ? (
              <Th className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select every advertisement on this page"
                  className="h-4 w-4 accent-primary-solid"
                />
              </Th>
            ) : null}
            <Th className="w-28">Reference</Th>
            <Th>Title</Th>
            <Th className="w-24">Type</Th>
            <Th className="w-32">Category</Th>
            <Th className="w-28">Location</Th>
            <Th className="w-40">Advertiser</Th>
            <Th className="w-32">{WHEN_HEADING[context]}</Th>
            <Th className="w-40">Status</Th>
            <Th className="w-24">
              <span className="sr-only">Actions</span>
            </Th>
          </>
        }
      >
        {items.map((item) => (
          <tr key={item.id} className="hover:bg-surface-sunken">
            {allowBulk ? (
              <Td>
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                  aria-label={`Select ${item.reference}`}
                  className="h-4 w-4 accent-primary-solid"
                />
              </Td>
            ) : null}

            <Td className="font-mono text-xs whitespace-nowrap">{item.reference}</Td>

            <Td>
              <Link
                href={`/admin/advertisements/${item.id}`}
                className="font-medium hover:text-primary"
              >
                <span className="line-clamp-2">{item.title}</span>
              </Link>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {item.imageCount > 0 ? (
                  <Badge>
                    {item.imageCount} photo{item.imageCount === 1 ? '' : 's'}
                  </Badge>
                ) : null}
                {item.artworkCount > 0 ? <Badge>{item.artworkCount} artwork</Badge> : null}
                {item.openReportCount > 0 ? (
                  <Badge tone="danger">
                    {item.openReportCount} report{item.openReportCount === 1 ? '' : 's'}
                  </Badge>
                ) : null}
                {item.isFeatured ? <Badge tone="featured">Featured</Badge> : null}
                {item.pendingRenewalId ? (
                  <Badge tone="warning">
                    Renewal{item.pendingRenewalTiming === 'early' ? ' · still live' : ''}
                  </Badge>
                ) : null}
              </div>
            </Td>

            <Td className="text-fg-muted">{item.kind === 'display' ? 'Display' : 'Classified'}</Td>
            <Td className="text-fg-muted">{item.categoryName ?? '—'}</Td>
            <Td className="text-fg-muted">{item.locationName ?? '—'}</Td>

            <Td>
              <span className="block truncate">{item.advertiserName}</span>
              {item.advertiserEmail ? (
                <span className="block truncate text-xs text-fg-subtle">
                  {item.advertiserEmail}
                </span>
              ) : null}
            </Td>

            <Td className="whitespace-nowrap">
              <When item={item} context={context} />
            </Td>

            <Td>
              {item.isLapsed ? (
                <StatusBadge status="expired" />
              ) : (
                <StatusBadge status={item.status} />
              )}
              {item.rejectionReason ? (
                <span className="mt-1 block max-w-48 text-xs text-fg-subtle">
                  {item.rejectionReason}
                </span>
              ) : null}
              {(item.status === 'rejected' || item.status === 'changes_requested') &&
              item.lastDecisionBy ? (
                <span className="mt-1 block text-xs text-fg-subtle">by {item.lastDecisionBy}</span>
              ) : null}
            </Td>

            <Td>
              <div className="flex flex-col items-start gap-1">
                <Link
                  href={`/admin/advertisements/${item.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  Review
                </Link>
                {item.pendingRenewalId ? (
                  <Link
                    href={`/admin/advertisements/${item.id}#lifecycle`}
                    className="text-xs text-primary hover:underline"
                  >
                    Review renewal
                  </Link>
                ) : null}
              </div>
            </Td>
          </tr>
        ))}
      </AdminTable>

      <AdminPagination page={page} pageCount={pageCount} hrefFor={hrefForPage} />

      <AdminDialog
        open={dialog !== null}
        title={
          dialog === 'approve'
            ? `Publish ${selected.size} advertisement${selected.size === 1 ? '' : 's'}?`
            : `Reject ${selected.size} advertisement${selected.size === 1 ? '' : 's'}?`
        }
        description={
          dialog === 'approve'
            ? 'They go live immediately. Each one you have not read is one nobody has read.'
            : 'Every one of them gets the same reason, and every advertiser reads it. Nothing is deleted.'
        }
        confirmLabel={dialog === 'approve' ? 'Approve them' : 'Reject them'}
        tone={dialog === 'reject' ? 'critical' : 'primary'}
        busy={busy}
        error={error}
        disabled={dialog === 'reject' && !composed}
        onConfirm={() => void runBulk()}
        onClose={closeDialog}
      >
        {dialog === 'reject' ? (
          <ReasonPicker
            options={REJECTION_REASONS}
            choice={choice}
            onChoice={setChoice}
            note={note}
            onNote={setNote}
            noteLabel="Anything to add"
            maxLength={MAX_NOTE}
          />
        ) : null}
      </AdminDialog>
    </div>
  );
}
