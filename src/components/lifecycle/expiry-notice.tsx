import { Button } from '@/components/ui/button';
import { canRequestRenewal, isExpiringSoon, type ExpiryState } from '@/lib/lifecycle/expiry';
import { cn } from '@/lib/utils';

/**
 * The owner's notice about their run. Shown only to the owner — the caller
 * decides that from `owner_ads`, which is empty for anybody else.
 *
 * Nothing when the run is comfortably in hand; a clear sentence and a renew
 * button when it is ending or has ended; a note instead of the button when a
 * renewal is already with the office.
 */
export function ExpiryNotice({
  state,
  advertisementId,
  hasPendingRenewal,
  className,
}: {
  state: ExpiryState;
  advertisementId: string;
  hasPendingRenewal: boolean;
  className?: string;
}) {
  const ending = isExpiringSoon(state);
  if (!ending && state.kind !== 'expired') return null;

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-md border p-4',
        state.kind === 'expired'
          ? 'border-line bg-surface-sunken'
          : 'border-accent-line bg-accent-surface text-accent-fg',
        className,
      )}
    >
      <p className="text-[0.9375rem] font-medium">{state.ownerSentence}</p>
      {hasPendingRenewal ? (
        <p className="text-sm">Your renewal is with our office for review.</p>
      ) : canRequestRenewal(state, hasPendingRenewal) ? (
        <Button href={`/my-ads/${advertisementId}/renew`} size="sm">
          Renew Advertisement
        </Button>
      ) : null}
    </div>
  );
}
