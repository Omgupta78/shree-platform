import { DISPLAY_TIME_ZONE } from '@/config/lifecycle';
import type { AdStatus } from '@/types/database';

/**
 * How far away an expiry is, in the words a person would use.
 *
 * Pure, and safe in the browser or on the server. Days are counted as
 * calendar days in India, not as 24-hour blocks: an advertisement that ends at
 * 10 a.m. tomorrow "expires tomorrow" whether it is 9 p.m. or 9 a.m. now. The
 * calendar date comes from `Intl` with an explicit time zone, so nothing here
 * adds or subtracts hours by hand, and the answer is the same whether the code
 * runs on a server in UTC or a phone in Roorkee.
 */

const isoDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const longDate = new Intl.DateTimeFormat('en-IN', {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Days since the epoch of the Indian calendar date an instant falls on. */
export function indianDayNumber(instant: Date): number {
  const [year = 1970, month = 1, day = 1] = isoDay.format(instant).split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** "30 September 2026", in India. */
export function formatLongDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : longDate.format(date);
}

/** The Indian calendar date as YYYY-MM-DD, for a date input's value. */
export function indianIsoDate(instant: Date): string {
  return isoDay.format(instant);
}

export type ExpiryKind = 'none' | 'active' | 'soon' | 'tomorrow' | 'today' | 'expired';

export interface ExpiryState {
  kind: ExpiryKind;
  /** Calendar days until the expiry date; negative once past; null without a date. */
  daysRemaining: number | null;
  /** "Expires on 30 September 2026", "Expires in 3 days", "Expires tomorrow", "Expired". */
  label: string;
  /** The same, as a sentence addressed to the owner. */
  ownerSentence: string;
}

export function expiryState(
  expiresAt: string | null,
  status: AdStatus,
  soonDays: number,
  now: Date = new Date(),
): ExpiryState {
  if (status === 'expired' || (status === 'approved' && expiresAt && new Date(expiresAt) <= now)) {
    const on = formatLongDate(expiresAt);
    return {
      kind: 'expired',
      daysRemaining: expiresAt ? indianDayNumber(new Date(expiresAt)) - indianDayNumber(now) : null,
      label: 'Expired',
      ownerSentence: on ? `This advertisement expired on ${on}.` : 'This advertisement has expired.',
    };
  }

  if (status !== 'approved' || !expiresAt) {
    return { kind: 'none', daysRemaining: null, label: '', ownerSentence: '' };
  }

  const expiry = new Date(expiresAt);
  const days = indianDayNumber(expiry) - indianDayNumber(now);

  if (days <= 0) {
    return {
      kind: 'today',
      daysRemaining: 0,
      label: 'Expires today',
      ownerSentence: 'Your advertisement expires today.',
    };
  }
  if (days === 1) {
    return {
      kind: 'tomorrow',
      daysRemaining: 1,
      label: 'Expires tomorrow',
      ownerSentence: 'Your advertisement expires tomorrow.',
    };
  }
  if (days <= soonDays) {
    return {
      kind: 'soon',
      daysRemaining: days,
      label: `Expires in ${days} days`,
      ownerSentence: `Your advertisement expires in ${days} days.`,
    };
  }
  const on = formatLongDate(expiresAt);
  return {
    kind: 'active',
    daysRemaining: days,
    label: `Expires on ${on}`,
    ownerSentence: `Your advertisement runs until ${on}.`,
  };
}

/** Expiring soon, today or tomorrow — the states that offer an early renewal. */
export function isExpiringSoon(state: ExpiryState): boolean {
  return state.kind === 'soon' || state.kind === 'tomorrow' || state.kind === 'today';
}

/** Whether an advertisement in this state can be sent for renewal. */
export function canRequestRenewal(state: ExpiryState, hasPendingRenewal: boolean): boolean {
  return !hasPendingRenewal && (state.kind === 'expired' || isExpiringSoon(state));
}
