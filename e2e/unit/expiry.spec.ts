import { expect, test } from '@playwright/test';

import {
  canRequestRenewal,
  expiryState,
  formatLongDate,
  indianDayNumber,
} from '../../src/lib/lifecycle/expiry';
import { summariseMyAdvertisements } from '../../src/lib/lifecycle/summary';

/**
 * The expiry wording, as pure functions. No browser: these run in Node, in
 * whatever time zone the machine has, and must give Indian answers anyway.
 */
test.describe('expiry states', () => {
  // 20 September 2026, 10:00 in India.
  const now = new Date('2026-09-20T04:30:00Z');

  test('a date well ahead reads as a date', () => {
    const state = expiryState('2026-09-30T06:00:00Z', 'approved', 7, now);
    expect(state.kind).toBe('active');
    expect(state.label).toBe('Expires on 30 September 2026');
  });

  test('inside the window it counts days', () => {
    const state = expiryState('2026-09-23T06:00:00Z', 'approved', 7, now);
    expect(state.kind).toBe('soon');
    expect(state.label).toBe('Expires in 3 days');
    expect(state.ownerSentence).toBe('Your advertisement expires in 3 days.');
  });

  test('tomorrow and today are calendar days in India, not 24-hour blocks', () => {
    // 21 September at 00:30 IST is tomorrow, even though it is under 24 hours away.
    expect(expiryState('2026-09-20T19:00:00Z', 'approved', 7, now).label).toBe('Expires tomorrow');
    // Late evening in India, when the two expiries below fall either side of
    // Indian midnight.
    const lateEvening = new Date('2026-09-20T17:00:00Z'); // 22:30 IST, 20 Sept
    expect(expiryState('2026-09-20T18:00:00Z', 'approved', 7, lateEvening).label).toBe('Expires today');
    expect(expiryState('2026-09-20T19:00:00Z', 'approved', 7, lateEvening).label).toBe('Expires tomorrow');
  });

  test('past its date, or swept, it is expired', () => {
    expect(expiryState('2026-09-19T00:00:00Z', 'approved', 7, now).label).toBe('Expired');
    const swept = expiryState('2026-09-10T06:00:00Z', 'expired', 7, now);
    expect(swept.kind).toBe('expired');
    expect(swept.ownerSentence).toBe('This advertisement expired on 10 September 2026.');
  });

  test('something not yet approved has no expiry state', () => {
    expect(expiryState(null, 'pending', 7, now).kind).toBe('none');
    expect(expiryState('2026-09-23T06:00:00Z', 'pending', 7, now).kind).toBe('none');
  });

  test('renewal is offered only when due and not already asked', () => {
    const soon = expiryState('2026-09-23T06:00:00Z', 'approved', 7, now);
    const later = expiryState('2026-10-23T06:00:00Z', 'approved', 7, now);
    const ended = expiryState('2026-09-10T06:00:00Z', 'expired', 7, now);
    expect(canRequestRenewal(soon, false)).toBe(true);
    expect(canRequestRenewal(soon, true)).toBe(false);
    expect(canRequestRenewal(later, false)).toBe(false);
    expect(canRequestRenewal(ended, false)).toBe(true);
  });

  test('dates are formatted for India whatever the server clock says', () => {
    expect(formatLongDate('2026-09-30T20:00:00Z')).toBe('1 October 2026');
    expect(indianDayNumber(new Date('2026-09-20T18:29:00Z'))).toBe(
      indianDayNumber(new Date('2026-09-20T00:00:00Z')),
    );
  });

  test('the dashboard figures come from the same states as the rows', () => {
    const ads = [
      { id: 'a', status: 'approved' as const, expiresAt: '2026-09-23T06:00:00Z' },
      { id: 'b', status: 'approved' as const, expiresAt: '2026-09-19T06:00:00Z' },
      { id: 'c', status: 'pending' as const, expiresAt: null },
      { id: 'd', status: 'draft' as const, expiresAt: null },
      { id: 'e', status: 'expired' as const, expiresAt: '2026-09-01T06:00:00Z' },
    ];
    const states = new Map(ads.map((ad) => [ad.id, expiryState(ad.expiresAt, ad.status, 7, now)]));
    const figures = Object.fromEntries(
      summariseMyAdvertisements(ads, states).map((stat) => [stat.key, stat.value]),
    );
    expect(figures).toEqual({ total: 5, published: 1, pending: 1, drafts: 1, expiring: 1, expired: 2 });
  });
});
