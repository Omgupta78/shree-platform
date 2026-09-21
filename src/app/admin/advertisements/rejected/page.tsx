import type { Metadata } from 'next';

import { QueueView } from '@/components/admin/queue-view';
import type { RawSearchParams } from '@/lib/admin/query';

export const metadata: Metadata = { title: 'Rejected' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <QueueView
      title="Rejected"
      description="Refused, with the reason the advertiser was given. Nothing is deleted; restoring one puts it back in the queue."
      status={'rejected'}
      basePath={'/admin/advertisements/rejected'}
      searchParams={await searchParams}
      emptyTitle="Nothing has been rejected"
      emptyDescription="A refused advertisement stays here with its reason, so the office can answer for the decision later."
    />
  );
}
