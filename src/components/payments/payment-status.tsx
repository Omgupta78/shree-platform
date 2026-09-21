import { Badge, type BadgeTone } from '@/components/ui/badge';
import type { PaymentPurpose, PaymentStatus } from '@/types/database';

/**
 * How a payment's state is written down, in one place.
 *
 * The advertiser's receipts, the office's ledger and the advertisement's own
 * page all show the same six words for the same six states. A status spelled
 * three ways is a status somebody will eventually mistake for three states.
 *
 * `created` and `pending` are both shown as "Awaiting payment", because the
 * difference between them — whether a checkout has been opened yet — is our
 * bookkeeping and not something the advertiser did or needs to act on
 * differently.
 */
const LABELS: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  created: { label: 'Awaiting payment', tone: 'warning' },
  pending: { label: 'Awaiting payment', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'neutral' },
};

export function paymentStatusLabel(status: PaymentStatus): string {
  return LABELS[status].label;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { label, tone } = LABELS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const PURPOSES: Record<PaymentPurpose, string> = {
  new_advertisement: 'New advertisement',
  renewal: 'Renewal',
};

export function paymentPurposeLabel(purpose: PaymentPurpose): string {
  return PURPOSES[purpose];
}
