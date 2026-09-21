import Link from 'next/link';

import { AdminEmpty, AdminTable, StatusBadge, Td, Th } from '@/components/admin/admin-ui';
import { ExpiryBadge } from '@/components/lifecycle/expiry-badge';
import { Badge } from '@/components/ui/badge';
import type { ExpiringAdvertisement } from '@/lib/admin/lifecycle';
import { expiryState, formatLongDate } from '@/lib/lifecycle/expiry';

/** Live advertisements close to the end of their run. */
export function AdminExpiryTable({
  items,
  soonDays,
}: {
  items: ExpiringAdvertisement[];
  soonDays: number;
}) {
  if (!items.length) {
    return (
      <AdminEmpty
        title="Nothing is expiring in this window"
        description="Widen the range to look further ahead."
      />
    );
  }
  const now = new Date();

  return (
    <div className="rounded-md border border-line bg-surface">
      <AdminTable
        caption="Advertisements expiring soon"
        head={
          <>
            <Th className="w-28">Reference</Th>
            <Th>Title</Th>
            <Th className="w-40">Advertiser</Th>
            <Th className="w-32">Category</Th>
            <Th className="w-32">Published</Th>
            <Th className="w-36">Expiry date</Th>
            <Th className="w-28">Days remaining</Th>
            <Th className="w-28">Status</Th>
          </>
        }
      >
        {items.map((item) => {
          const state = expiryState(item.expiresAt, item.status, soonDays, now);
          return (
            <tr key={item.id} className="hover:bg-surface-sunken">
              <Td className="font-mono text-xs whitespace-nowrap">{item.reference}</Td>
              <Td>
                <Link href={`/admin/advertisements/${item.id}`} className="font-medium hover:text-primary">
                  <span className="line-clamp-2">{item.title}</span>
                </Link>
                {item.pendingRenewalId ? (
                  <Badge tone="warning" className="mt-1">
                    Renewal waiting
                  </Badge>
                ) : null}
              </Td>
              <Td className="text-fg-muted">{item.advertiserName}</Td>
              <Td className="text-fg-muted">{item.categoryName ?? '—'}</Td>
              <Td className="text-fg-muted">{formatLongDate(item.publishedAt) || '—'}</Td>
              <Td className="text-fg-muted">{formatLongDate(item.expiresAt)}</Td>
              <Td>
                <span className="block tabular-nums">{state.daysRemaining ?? '—'}</span>
                <ExpiryBadge state={state} className="mt-1" />
              </Td>
              <Td>
                <StatusBadge status={item.status} />
              </Td>
            </tr>
          );
        })}
      </AdminTable>
    </div>
  );
}
