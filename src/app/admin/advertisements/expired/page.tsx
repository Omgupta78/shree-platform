import type { Metadata } from 'next';

import { RunExpirySweep } from '@/components/admin/lifecycle-controls';
import { QueueView } from '@/components/admin/queue-view';
import type { RawSearchParams } from '@/lib/admin/query';

export const metadata: Metadata = { title: 'Expired' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <QueueView
      title="Expired"
      description="Advertisements whose run has ended — including any past their date that the scheduled check has not reached yet. Nothing is deleted; an advertiser renews one and it comes back through review."
      actions={<RunExpirySweep />}
      status={'expired'}
      basePath={'/admin/advertisements/expired'}
      searchParams={await searchParams}
      emptyTitle="Nothing has expired yet"
      emptyDescription="An advertisement appears here once its publication window has passed."
    />
  );
}
