import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** URL-safe slug from a title. Devanagari is preserved rather than stripped. */
export function slugify(input: string): string {
  const cleaned = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ऀ-ॿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

  // A title written entirely in Devanagari yields no ASCII slug; fall back to a
  // stable placeholder so the URL stays valid.
  return /[a-z0-9]/.test(cleaned) ? cleaned : 'listing';
}
