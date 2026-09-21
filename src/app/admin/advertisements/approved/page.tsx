import type { Metadata } from 'next';

import { QueueView } from '@/components/admin/queue-view';
import type { RawSearchParams } from '@/lib/admin/query';

export const metadata: Metadata = { title: 'Approved' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <QueueView
      title="Approved"
      description="Live on the site. Unpublishing returns one to the queue; ending its run marks it finished."
      status={'approved'}
      basePath={'/admin/advertisements/approved'}
      searchParams={await searchParams}
      emptyTitle="Nothing is live"
      emptyDescription="Approved advertisements appear here until their run ends."
    />
  );
}
