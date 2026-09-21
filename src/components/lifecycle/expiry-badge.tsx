import { Badge, type BadgeTone } from '@/components/ui/badge';
import type { ExpiryState } from '@/lib/lifecycle/expiry';

const TONE: Record<ExpiryState['kind'], BadgeTone> = {
  none: 'neutral',
  active: 'neutral',
  soon: 'warning',
  tomorrow: 'danger',
  today: 'danger',
  expired: 'neutral',
};

/** "Expires on 30 September 2026", "Expires in 3 days", "Expires tomorrow", "Expired". */
export function ExpiryBadge({ state, className }: { state: ExpiryState; className?: string }) {
  if (state.kind === 'none') return null;
  return (
    <Badge tone={TONE[state.kind]} className={className}>
      {state.label}
    </Badge>
  );
}
