import type { Metadata } from 'next';
import Link from 'next/link';

import { OwnerGate } from '@/components/my-ads/owner-gate';
import {
  PaymentStatusBadge,
  paymentPurposeLabel,
} from '@/components/payments/payment-status';
import { Container } from '@/components/ui/container';
import { EmptyState } from '@/components/ui/states';
import { OWNER_PAYMENTS_PAGE_SIZE, getUserPayments } from '@/lib/data/payments';
import { formatDate, formatPaise } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Payments',
  robots: { index: false, follow: false },
};

/**
 * The advertiser's own payments.
 *
 * Read from `my_payments`, whose WHERE clause is `user_id = auth.uid()` — so
 * there is no ownership check on this page to get wrong, and none to forget on
 * the next one. The provider's payment reference is shown because it is what
 * somebody quotes when they ring the office; the settlement signature is not
 * in the view at all.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  const pageNumber = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 1;

  return (
    <OwnerGate next="/my-ads/payments">
      <Payments pageNumber={pageNumber} />
    </OwnerGate>
  );
}

async function Payments({ pageNumber }: { pageNumber: number }) {
  const listing = await getUserPayments({
    index: pageNumber - 1,
    size: OWNER_PAYMENTS_PAGE_SIZE,
  });
  const payments = listing.rows;
  const pageCount = Math.max(1, Math.ceil(listing.total / OWNER_PAYMENTS_PAGE_SIZE));

  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm">
          <Link href="/my-ads" className="text-fg-muted hover:text-primary">
            ← My advertisements
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Payments</h1>
        <p className="mt-2 text-[0.9375rem] text-fg-muted">
          Everything you have paid for, and anything still owing. Paying for an advertisement does
          not publish it — each one is read by our office first.
        </p>

        <div className="mt-8">
          {payments.length === 0 ? (
            <EmptyState
              title="No payments yet"
              description="When you book an advertisement on a package with a rate, the payment appears here."
              action={{ href: '/my-ads', label: 'Back to my advertisements' }}
            />
          ) : (
            <ul className="space-y-3">
              {payments.map((payment) => (
                <li key={payment.id}>
                  <Link
                    href={`/my-ads/payments/${payment.id}`}
                    data-payment={payment.id}
                    className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4 transition-colors hover:border-line-strong sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{payment.ad_title}</span>
                      <span className="mt-1 block text-sm text-fg-muted">
                        <span className="tabular-nums">{payment.ad_reference}</span>
                        {' · '}
                        {payment.package_name ?? payment.package_id}
                        {' · '}
                        {paymentPurposeLabel(payment.purpose)}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-4">
                      <span className="text-right">
                        <span className="block font-serif text-lg font-semibold tabular-nums">
                          {formatPaise(payment.amount_paise)}
                        </span>
                        <span className="block text-xs text-fg-subtle">
                          {formatDate(payment.paid_at ?? payment.created_at)}
                        </span>
                      </span>
                      <PaymentStatusBadge status={payment.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Only once there is a second page to go to. */}
          {pageCount > 1 ? (
            <nav
              aria-label="Pages of your payments"
              className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4 text-sm"
            >
              {pageNumber > 1 ? (
                <Link
                  href={`/my-ads/payments?page=${pageNumber - 1}`}
                  rel="prev"
                  className="font-medium text-primary hover:underline"
                >
                  ← Newer
                </Link>
              ) : (
                <span className="text-fg-subtle">← Newer</span>
              )}

              <span className="text-fg-muted tabular-nums">
                Page {pageNumber} of {pageCount}
              </span>

              {pageNumber < pageCount ? (
                <Link
                  href={`/my-ads/payments?page=${pageNumber + 1}`}
                  rel="next"
                  className="font-medium text-primary hover:underline"
                >
                  Older →
                </Link>
              ) : (
                <span className="text-fg-subtle">Older →</span>
              )}
            </nav>
          ) : null}
        </div>
      </div>
    </Container>
  );
}
