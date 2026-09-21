import { AdminFilters } from '@/components/admin/admin-filters';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import { QueueTable, type QueueContext } from '@/components/admin/queue-table';
import { queryQueue } from '@/lib/admin/advertisements';
import {
  parseAdminQuery,
  toAdminSearchParams,
  type RawSearchParams,
} from '@/lib/admin/query';
import type { AdStatus } from '@/types/database';

/**
 * One implementation behind every queue page.
 *
 * `/admin/advertisements/pending` and `/admin/advertisements/rejected` differ
 * by a status and a sentence. Writing them as five pages would mean five
 * places to add a column and four places to forget it; writing them as one
 * means the pending queue and the rejected list are provably the same screen,
 * which is what somebody moving between them expects.
 *
 * The preset status is not overridable from the URL — see `parseAdminQuery`.
 * A page headed "Pending review" that could be made to list approved
 * advertisements would be lying to the person reading it.
 */
const CONTEXT_FOR: Partial<Record<AdStatus, QueueContext>> = {
  pending: 'queue',
  changes_requested: 'queue',
  approved: 'approved',
  rejected: 'rejected',
  expired: 'expired',
};

export async function QueueView({
  title,
  description,
  status,
  basePath,
  searchParams,
  allowBulk = false,
  emptyTitle,
  emptyDescription,
  actions,
}: {
  title: string;
  description: string;
  status: AdStatus | null;
  basePath: string;
  searchParams: RawSearchParams;
  allowBulk?: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  actions?: React.ReactNode;
}) {
  const query = parseAdminQuery(searchParams, status);
  const page = await queryQueue(query);

  const pageQuery = toAdminSearchParams(
    { ...query, page: 1 },
    status === null,
  ).toString();

  return (
    <>
      <AdminPageHeader title={title} description={description} count={page.total} actions={actions} />

      <AdminFilters query={query} basePath={basePath} showStatus={status === null} />

      <QueueTable
        items={page.items}
        total={page.total}
        page={page.page}
        pageCount={page.pageCount}
        basePath={basePath}
        pageQuery={pageQuery}
        allowBulk={allowBulk}
        context={(status && CONTEXT_FOR[status]) || 'all'}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
      />
    </>
  );
}
