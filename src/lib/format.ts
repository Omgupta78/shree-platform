import type { PriceType } from '@/types/database';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const compactInr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Formats a price using Indian digit grouping (₹1,00,000). */
export function formatPrice(
  price: number | null,
  priceType: PriceType,
  options: { compact?: boolean } = {},
): string {
  switch (priceType) {
    case 'free':
      return 'Free';
    case 'on_call':
      return 'Price on call';
    case 'negotiable':
      return price === null ? 'Negotiable' : `${format(price, options)} (neg.)`;
    case 'fixed':
      return price === null ? 'Price on call' : format(price, options);
  }
}

function format(price: number, { compact }: { compact?: boolean }) {
  return compact && price >= 100000 ? compactInr.format(price) : inr.format(price);
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
}

const relative = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 days ago" — falls back to an absolute date beyond a year. */
export function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const seconds = (date.getTime() - Date.now()) / 1000;
  const magnitude = Math.abs(seconds);
  if (magnitude < 60) return 'just now';

  for (const [unit, unitSeconds] of UNITS) {
    if (magnitude >= unitSeconds) {
      return relative.format(Math.round(seconds / unitSeconds), unit);
    }
  }
  return dateFormatter.format(date);
}

/** 9719419913 → +91 97194 19913 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

export function telHref(phone: string): string {
  return `tel:+91${phone.replace(/\D/g, '').slice(-10)}`;
}

export function whatsAppHref(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  const base = `https://wa.me/91${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
