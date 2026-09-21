import type { Metadata } from 'next';

import { QueueView } from '@/components/admin/queue-view';
import type { RawSearchParams } from '@/lib/admin/query';

export const metadata: Metadata = { title: 'Pending review' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <QueueView
      title="Pending review"
      description="The queue. Longest waiting first, because the advertiser at the top has been waiting the longest."
      status={'pending'}
      basePath={'/admin/advertisements/pending'}
      searchParams={await searchParams}
      allowBulk
      emptyTitle="The queue is clear"
      emptyDescription="Every advertisement that has come in has been dealt with."
    />
  );
}
