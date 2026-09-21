import type { Metadata } from 'next';
import Link from 'next/link';

import { OwnerGate } from '@/components/my-ads/owner-gate';
import {
  PaymentStatusBadge,
  paymentPurposeLabel,
} from '@/components/payments/payment-status';
import { Container } from '@/components/ui/container';
import { EmptyState } from '@/components/ui/states';
import { getUserPayments } from '@/lib/data/payments';
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
export default async function PaymentsPage() {
  return (
    <OwnerGate next="/my-ads/payments">
      <Payments />
    </OwnerGate>
  );
}

async function Payments() {
  const payments = await getUserPayments();

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
        </div>
      </div>
    </Container>
  );
}
