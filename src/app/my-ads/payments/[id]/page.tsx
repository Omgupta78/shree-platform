import type { Metadata } from 'next';
import Link from 'next/link';

import { OwnerGate } from '@/components/my-ads/owner-gate';
import { PaymentPanel } from '@/components/payments/payment-panel';
import {
  PaymentStatusBadge,
  paymentPurposeLabel,
} from '@/components/payments/payment-status';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { EmptyState } from '@/components/ui/states';
import { SITE } from '@/config/site';
import { getUserPayment } from '@/lib/data/payments';
import { formatDate, formatPaise } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Payment',
  robots: { index: false, follow: false },
};

/**
 * One payment, as a receipt.
 *
 * This page is what a refresh lands on, and it is deliberately not called
 * "success". What it says is read out of the database every time: a payment
 * that is paid says paid, one that failed says failed, and one still waiting
 * says so and offers the checkout again. Nothing here infers an outcome from
 * having been reached — a page that says "Payment successful" because of its
 * own URL is a page that will eventually say it to somebody who was charged
 * nothing.
 *
 * It also keeps the two states apart that advertisers most often confuse:
 * what the payment is doing, and what the advertisement is doing. Paid and
 * awaiting review is an ordinary, correct state, and it is spelled out.
 */
export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <OwnerGate next={`/my-ads/payments/${id}`}>
      <Payment id={id} />
    </OwnerGate>
  );
}

async function Payment({ id }: { id: string }) {
  const payment = await getUserPayment(id);

  if (!payment) {
    return (
      <Container className="py-16">
        <EmptyState
          title="Payment not found"
          description="We could not find that payment on your account."
          action={{ href: '/my-ads/payments', label: 'All payments' }}
        />
      </Container>
    );
  }

  const settled = payment.status === 'paid';
  const owing = payment.status === 'created' || payment.status === 'pending';

  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm">
          <Link href="/my-ads/payments" className="text-fg-muted hover:text-primary">
            ← All payments
          </Link>
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold">
            {settled ? 'Payment successful' : 'Payment'}
          </h1>
          <PaymentStatusBadge status={payment.status} />
        </div>

        {settled ? (
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-muted">
            Thank you. This does not publish the advertisement — it is read by our office first, and
            appears on the site once it is approved.
          </p>
        ) : null}

        {payment.status === 'failed' ? (
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-muted">
            Payment was not completed{payment.failure_reason ? `: ${payment.failure_reason}` : '.'}{' '}
            Nothing has been charged.
          </p>
        ) : null}

        {payment.status === 'cancelled' ? (
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-muted">
            This payment was cancelled and nothing was charged. Your advertisement is saved.
          </p>
        ) : null}

        <dl className="mt-8 divide-y divide-line rounded-md border border-line bg-surface">
          <Row label="Advertisement">
            <Link href={`/my-ads/${payment.ad_id}`} className="font-medium hover:text-primary">
              {payment.ad_title}
            </Link>
          </Row>
          <Row label="Reference">
            <span className="tabular-nums">{payment.ad_reference}</span>
          </Row>
          <Row label="Package">{payment.package_name ?? payment.package_id}</Row>
          {payment.package_duration_days ? (
            <Row label="Run length">
              <span className="tabular-nums">{payment.package_duration_days}</span> days after
              approval
            </Row>
          ) : null}
          <Row label="Payment type">{paymentPurposeLabel(payment.purpose)}</Row>
          <Row label="Amount">
            <span className="font-serif text-lg font-semibold tabular-nums">
              {formatPaise(payment.amount_paise)}
            </span>{' '}
            <span className="text-fg-subtle">{payment.currency}</span>
          </Row>
          <Row label="Payment status">{<PaymentStatusBadge status={payment.status} />}</Row>
          <Row label={settled ? 'Paid on' : 'Started on'}>
            {formatDate(payment.paid_at ?? payment.created_at)}
          </Row>
          {/*
            The provider's own reference, because it is what somebody quotes
            when they ring the office. Nothing else of Razorpay's is shown:
            the order id is bookkeeping and the signature is evidence, and
            neither is any use to the person holding the receipt.
          */}
          {payment.provider_payment_id ? (
            <Row label="Payment reference">
              <span className="font-mono text-sm break-all">{payment.provider_payment_id}</span>
            </Row>
          ) : null}
          <Row label="Advertisement status">
            {payment.ad_status === 'pending'
              ? 'Awaiting review'
              : payment.ad_status.replace(/_/g, ' ')}
          </Row>
        </dl>

        {owing ? (
          <div className="mt-6">
            <PaymentPanel advertisementId={payment.ad_id} purpose={payment.purpose} renewalId={payment.renewal_id} />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button href={`/my-ads/${payment.ad_id}`}>View the advertisement</Button>
            <Button href="/my-ads/payments" variant="secondary">
              All payments
            </Button>
          </div>
        )}

        <p className="mt-6 text-sm text-fg-muted">
          Anything not right? Call our office on{' '}
          <a href={`tel:+91${SITE.phones[0]}`} className="font-medium text-primary hover:underline">
            {SITE.phones[0]}
          </a>
          , quoting your advertisement reference.
        </p>
      </div>
    </Container>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="sm:text-right">{children}</dd>
    </div>
  );
}
