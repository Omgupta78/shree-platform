import type { ExpiryState } from '@/lib/lifecycle/expiry';
import type { AdStatus } from '@/types/database';

export interface DashboardStat {
  key: 'total' | 'published' | 'pending' | 'drafts' | 'expiring' | 'expired';
  label: string;
  value: number;
  href?: string;
}

/**
 * The six figures at the top of the advertiser's dashboard, computed from the
 * rows already on the page with the same expiry states the rows show — so the
 * numbers and the list are one calculation, not two that can disagree.
 */
export function summariseMyAdvertisements(
  advertisements: ReadonlyArray<{ id: string; status: AdStatus }>,
  states: ReadonlyMap<string, ExpiryState>,
): DashboardStat[] {
  let published = 0;
  let pending = 0;
  let drafts = 0;
  let expiring = 0;
  let expired = 0;

  for (const ad of advertisements) {
    const kind = states.get(ad.id)?.kind ?? 'none';
    if (kind === 'expired') expired += 1;
    else if (ad.status === 'approved') {
      published += 1;
      if (kind === 'soon' || kind === 'tomorrow' || kind === 'today') expiring += 1;
    } else if (ad.status === 'pending' || ad.status === 'changes_requested') pending += 1;
    else if (ad.status === 'draft') drafts += 1;
  }

  return [
    { key: 'total', label: 'Total Ads', value: advertisements.length },
    { key: 'published', label: 'Published', value: published },
    { key: 'pending', label: 'Pending', value: pending },
    { key: 'drafts', label: 'Drafts', value: drafts },
    { key: 'expiring', label: 'Expiring Soon', value: expiring, href: '#expiring-soon' },
    { key: 'expired', label: 'Expired', value: expired, href: '/my-ads/expired' },
  ];
}
