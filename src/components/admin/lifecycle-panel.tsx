import {
  ExtendExpiryDialog,
  ManualExpireDialog,
  RenewalDecision,
} from '@/components/admin/lifecycle-controls';
import { AdminPanel, Detail } from '@/components/admin/admin-ui';
import { ExpiryBadge } from '@/components/lifecycle/expiry-badge';
import { RenewalHistory } from '@/components/lifecycle/renewal-history';
import { PACKAGE_BY_ID } from '@/config/packages';
import type { ReviewAdvertisement } from '@/lib/admin/advertisements';
import { getAdvertisementRenewals } from '@/lib/admin/lifecycle';
import type { LifecycleSettings } from '@/lib/data/lifecycle-settings';
import { expiryState, formatLongDate, indianIsoDate } from '@/lib/lifecycle/expiry';

/**
 * The run, its renewals, and the administrator's overrides — on the review
 * page, beside the decision buttons.
 */
export async function LifecyclePanel({
  advertisement,
  role,
  settings,
}: {
  advertisement: ReviewAdvertisement;
  role: 'admin' | 'moderator';
  settings: LifecycleSettings;
}) {
  const renewals = await getAdvertisementRenewals(advertisement.id);
  const now = new Date();
  const state = expiryState(advertisement.expiresAt, advertisement.status, settings.expiringSoonDays, now);
  const live = advertisement.status === 'approved' && state.kind !== 'expired';
  const pending = renewals.find((item) => item.status === 'pending') ?? null;
  const packageName = (id: string | null) => (id ? (PACKAGE_BY_ID.get(id)?.name ?? id) : '—');

  return (
    <div id="lifecycle">
      <AdminPanel title="Lifecycle" description="Publication, expiry and renewals.">
        <dl>
          <Detail label="Published">{formatLongDate(advertisement.publishedAt) || 'Not yet'}</Detail>
          <Detail label="Expiry date">
            {formatLongDate(advertisement.expiresAt) || 'Set on approval'}
            {state.kind !== 'none' ? (
              <span className="mt-1 block">
                <ExpiryBadge state={state} />
              </span>
            ) : null}
          </Detail>
          {live && state.daysRemaining !== null ? (
            <Detail label="Days remaining">
              <span className="tabular-nums">{state.daysRemaining}</span>
            </Detail>
          ) : null}
          <Detail label="Package">{packageName(advertisement.packageId)}</Detail>
        </dl>

        {pending ? (
          <div className="border-t border-line px-4 py-3">
            <p className="text-sm font-medium">
              Renewal #{pending.renewal_number} waiting
              <span className="font-normal text-fg-muted">
                {' '}
                · {pending.timing === 'early' ? 'asked for while live' : 'asked for after expiry'} ·{' '}
                {packageName(pending.package_id)} · {formatLongDate(pending.requested_at)}
              </span>
            </p>
            <div className="mt-3">
              <RenewalDecision
                renewalId={pending.id}
                reference={advertisement.reference}
                timing={pending.timing}
                packageName={packageName(pending.package_id)}
              />
            </div>
          </div>
        ) : null}

        {role === 'admin' && advertisement.status === 'approved' ? (
          <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
            {live && advertisement.expiresAt ? (
              <ExtendExpiryDialog
                advertisementId={advertisement.id}
                reference={advertisement.reference}
                currentExpiryDate={indianIsoDate(new Date(Date.parse(advertisement.expiresAt) + 86_400_000))}
                maxDate={indianIsoDate(new Date(now.getTime() + settings.maxExtensionDays * 86_400_000))}
              />
            ) : null}
            <ManualExpireDialog advertisementId={advertisement.id} reference={advertisement.reference} />
          </div>
        ) : null}

        <div className="border-t border-line px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-fg-muted">Renewal history</p>
          <RenewalHistory
            renewals={renewals.map((item) => ({
              id: item.id,
              renewalNumber: item.renewal_number,
              packageId: item.package_id,
              timing: item.timing,
              status: item.status,
              requestedAt: item.requested_at,
              previousPublishedAt: item.previous_published_at,
              previousExpiresAt: item.previous_expires_at,
              decidedAt: item.decided_at,
              decisionNote: item.decision_note,
              newPublishedAt: item.new_published_at,
              newExpiresAt: item.new_expires_at,
            }))}
          />
        </div>
      </AdminPanel>
    </div>
  );
}
