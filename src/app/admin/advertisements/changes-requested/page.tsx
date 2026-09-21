import type { Metadata } from 'next';

import { QueueView } from '@/components/admin/queue-view';
import type { RawSearchParams } from '@/lib/admin/query';

export const metadata: Metadata = { title: 'Changes requested' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <QueueView
      title="Changes requested"
      description="Sent back to the advertiser with a message. They are waiting on somebody who is not you."
      status={'changes_requested'}
      basePath={'/admin/advertisements/changes-requested'}
      searchParams={await searchParams}
      emptyTitle="Nobody has been asked for a change"
      emptyDescription="When you send an advertisement back for a correction it waits here until the advertiser resubmits it."
    />
  );
}
