import type { Metadata } from 'next';

import { QueueView } from '@/components/admin/queue-view';
import type { RawSearchParams } from '@/lib/admin/query';

export const metadata: Metadata = { title: 'All advertisements' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <QueueView
      title="All advertisements"
      description="Everything ever submitted, in any state. The filters are the point of this page."
      status={null}
      basePath={'/admin/advertisements'}
      searchParams={await searchParams}
      emptyTitle="Nothing matches those filters"
      emptyDescription="Try clearing one of them — the search covers the reference, the title, the advertiser's name and their email address."
    />
  );
}
