import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminEmpty, AdminPageHeader, AdminTable, StatusBadge, Td, Th } from '@/components/admin/admin-ui';
import { RenewalDecision } from '@/components/admin/lifecycle-controls';
import { Badge } from '@/components/ui/badge';
import { PACKAGE_BY_ID } from '@/config/packages';
import { getPendingRenewals } from '@/lib/admin/lifecycle';
import { formatLongDate } from '@/lib/lifecycle/expiry';

export const metadata: Metadata = { title: 'Renewals' };

/**
 * Renewals waiting for a decision. A renewal asked for after expiry is also in
 * the pending queue, where the ordinary Approve button settles it; this page
 * is the one place to see both kinds together — including early renewals of
 * advertisements that are still live and so appear in no queue at all.
 */
export default async function RenewalsPage() {
  const renewals = await getPendingRenewals();

  return (
    <>
      <AdminPageHeader
        title="Renewals"
        description="Approving publishes a new run calculated from the package; nothing is charged in this phase."
        count={renewals.length}
      />
      {renewals.length === 0 ? (
        <AdminEmpty title="No renewals waiting" description="Requests appear here as advertisers send them." />
      ) : (
        <div className="rounded-md border border-line bg-surface">
          <AdminTable
            caption="Renewals waiting"
            head={
              <>
                <Th className="w-28">Reference</Th>
                <Th>Title</Th>
                <Th className="w-36">Advertiser</Th>
                <Th className="w-32">Requested</Th>
                <Th className="w-36">Current state</Th>
                <Th className="w-24">Package</Th>
                <Th className="w-64">
                  <span className="sr-only">Decision</span>
                </Th>
              </>
            }
          >
            {renewals.map((renewal) => (
              <tr key={renewal.renewalId} className="align-top hover:bg-surface-sunken">
                <Td className="font-mono text-xs whitespace-nowrap">{renewal.reference}</Td>
                <Td>
                  <Link
                    href={`/admin/advertisements/${renewal.advertisementId}#lifecycle`}
                    className="font-medium hover:text-primary"
                  >
                    {renewal.title}
                  </Link>
                </Td>
                <Td className="text-fg-muted">{renewal.advertiserName}</Td>
                <Td className="text-fg-muted">{formatLongDate(renewal.requestedAt)}</Td>
                <Td>
                  <StatusBadge status={renewal.status} />
                  <Badge className="mt-1">
                    {renewal.timing === 'early' ? 'Asked while live' : 'Asked after expiry'}
                  </Badge>
                  {renewal.expiresAt ? (
                    <span className="mt-1 block text-xs text-fg-subtle">
                      Run ends {formatLongDate(renewal.expiresAt)}
                    </span>
                  ) : null}
                </Td>
                <Td className="text-fg-muted">
                  {PACKAGE_BY_ID.get(renewal.packageId)?.name ?? renewal.packageId}
                </Td>
                <Td>
                  <RenewalDecision
                    renewalId={renewal.renewalId}
                    reference={renewal.reference}
                    timing={renewal.timing}
                    packageName={PACKAGE_BY_ID.get(renewal.packageId)?.name ?? renewal.packageId}
                  />
                </Td>
              </tr>
            ))}
          </AdminTable>
        </div>
      )}
    </>
  );
}
