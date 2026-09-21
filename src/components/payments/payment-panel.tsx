'use client';

import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { AlertIcon, CheckIcon } from '@/components/ui/icons';
import { formatPaise } from '@/lib/format';
import { openCheckout, type CheckoutOrder } from '@/lib/payments/checkout';
import type { PaymentPurpose } from '@/types/database';

/**
 * Paying for one advertisement, or for one renewal.
 *
 * The exchange is the same in both cases and is written once: ask the server
 * for an order, open the checkout against it, send the answer back to be
 * verified, and show what the server said — not what the checkout said.
 *
 * The distinction in that last clause is the point of the whole component. The
 * browser is told "paid" by Razorpay's script, which is a claim by a script;
 * it is told "paid" by `/api/payments/verify`, which is the same claim after a
 * signature check against a secret the browser does not hold. Only the second
 * is shown, and only the second was ever written down.
 */

type Stage =
  | { kind: 'idle' }
  | { kind: 'working'; note: string }
  | { kind: 'nothing_to_pay' }
  | { kind: 'paid' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

export interface PaymentPanelProps {
  advertisementId: string;
  purpose: PaymentPurpose;
  renewalId?: string | null;
  onPaid?: () => void;
  /** Shown when there is nothing to collect, and after a successful payment. */
  children?: React.ReactNode;
}

export function PaymentPanel({
  advertisementId,
  purpose,
  renewalId,
  onPaid,
  children,
}: PaymentPanelProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [order, setOrder] = useState<CheckoutOrder | null>(null);

  const pay = useCallback(async () => {
    setStage({ kind: 'working', note: 'Preparing your payment…' });

    let checkoutOrder: CheckoutOrder;
    try {
      const response = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ advertisementId, purpose, renewalId: renewalId ?? null }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        chargeable?: boolean;
        order?: CheckoutOrder;
        message?: string;
      };

      if (!response.ok || !body.ok) {
        setStage({
          kind: 'failed',
          message: body.message ?? 'We could not start the payment. Please try again.',
        });
        return;
      }

      // An unpriced package. Nothing to collect, and nothing to apologise for
      // — the advertisement is already with the office.
      if (!body.chargeable || !body.order) {
        setStage({ kind: 'nothing_to_pay' });
        return;
      }
      checkoutOrder = body.order;
      setOrder(checkoutOrder);
    } catch {
      setStage({ kind: 'failed', message: 'We could not reach the site. Please try again.' });
      return;
    }

    setStage({ kind: 'working', note: 'Opening the payment window…' });

    let outcome;
    try {
      outcome = await openCheckout(checkoutOrder);
    } catch {
      setStage({
        kind: 'failed',
        message: 'The payment window could not be opened. Please check your connection and try again.',
      });
      return;
    }

    if (outcome.kind === 'dismissed') {
      await tell({ action: 'cancel', razorpayOrderId: outcome.orderId });
      setStage({ kind: 'cancelled' });
      return;
    }

    if (outcome.kind === 'failed') {
      setStage({ kind: 'failed', message: outcome.reason });
      return;
    }

    setStage({ kind: 'working', note: 'Confirming your payment…' });

    const verified = await tell({
      action: 'verify',
      razorpayOrderId: outcome.orderId,
      razorpayPaymentId: outcome.paymentId,
      razorpaySignature: outcome.signature,
    });

    if (verified?.ok && verified.status === 'paid') {
      setStage({ kind: 'paid' });
      onPaid?.();
      return;
    }

    setStage({
      kind: 'failed',
      message:
        verified?.message ??
        'We could not confirm that payment. Please contact the office before paying again.',
    });
  }, [advertisementId, purpose, renewalId, onPaid]);

  if (stage.kind === 'paid') {
    return (
      <Notice tone="positive" title="Payment successful">
        <p>
          {order ? `${formatPaise(order.amountPaise)} received for ${order.packageName}.` : null} Your
          advertisement is now with our office for review.
        </p>
        <p className="mt-2 text-sm">
          Paying does not publish an advertisement — it is read by a person first, and you will see
          it on the site once it is approved.
        </p>
        {children}
      </Notice>
    );
  }

  if (stage.kind === 'nothing_to_pay') {
    return (
      <Notice tone="neutral" title="Nothing to pay">
        <p>
          Our advertising team will confirm the rate for this advertisement and how to settle it.
          Your advertisement is already with the office.
        </p>
        {children}
      </Notice>
    );
  }

  return (
    <div className="rounded-md border border-line bg-surface p-5 sm:p-6">
      {order ? (
        <dl className="mb-5 space-y-2 border-b border-line pb-5 text-sm">
          <Row label="Advertisement" value={order.adTitle} />
          <Row label="Reference" value={order.adReference} />
          <Row label="Package" value={order.packageName} />
          <Row
            label="Amount"
            value={formatPaise(order.amountPaise)}
            emphasis
          />
        </dl>
      ) : null}

      {stage.kind === 'cancelled' ? (
        <p className="mb-4 flex gap-2 rounded-sm border border-accent-line bg-accent-surface p-3 text-sm text-accent-fg">
          <AlertIcon size={17} className="mt-px shrink-0" />
          <span>
            Payment cancelled. Nothing has been charged, and your advertisement is saved — you can
            pay for it whenever you are ready.
          </span>
        </p>
      ) : null}

      {stage.kind === 'failed' ? (
        <p
          role="alert"
          className="mb-4 flex gap-2 rounded-sm border border-critical-line bg-critical-surface p-3 text-sm text-critical-fg"
        >
          <AlertIcon size={17} className="mt-px shrink-0" />
          <span>
            Payment was not completed. {stage.message}
          </span>
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          onClick={() => void pay()}
          disabled={stage.kind === 'working'}
          fullWidth
          className="sm:w-auto"
        >
          {stage.kind === 'working'
            ? stage.note
            : stage.kind === 'idle'
              ? 'Pay now'
              : 'Try again'}
        </Button>

        <Button href="/my-ads" variant="secondary" fullWidth className="sm:w-auto">
          Back to my advertisements
        </Button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-fg-subtle">
        Payment is handled by Razorpay. Shree Classified never sees or stores your card, UPI or bank
        details.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- helpers -- */

async function tell(body: Record<string, unknown>) {
  try {
    const response = await fetch('/api/payments/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await response.json()) as { ok?: boolean; status?: string; message?: string };
  } catch {
    return null;
  }
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={emphasis ? 'font-serif text-lg font-semibold tabular-nums' : 'text-right font-medium'}>
        {value}
      </dd>
    </div>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: 'positive' | 'neutral';
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === 'positive'
          ? 'rounded-md border border-line bg-positive-surface p-5 text-positive-fg sm:p-6'
          : 'rounded-md border border-line bg-surface-sunken p-5 sm:p-6'
      }
    >
      <p className="flex items-center gap-2 font-serif text-lg font-semibold">
        {tone === 'positive' ? <CheckIcon size={20} /> : null}
        {title}
      </p>
      <div
        className={
          tone === 'positive'
            ? 'mt-2 text-[0.9375rem] leading-relaxed'
            : 'mt-2 text-[0.9375rem] leading-relaxed text-fg-muted'
        }
      >
        {children}
      </div>
    </div>
  );
}
