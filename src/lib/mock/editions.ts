import type { Edition } from '@/types/content';

/**
 * DEVELOPMENT PLACEHOLDER DATA — replaced by the `editions` table once the
 * admin panel can upload a weekly PDF.
 *
 * `coverImageUrl` and `pdfUrl` are null on purpose: no scanned page is shown
 * and no download is offered until real edition management exists, so the UI
 * never implies a file that is not there.
 */

/** Most recent Saturday on or before the given date, in Asia/Kolkata terms. */
function lastPublicationDay(from = new Date()): string {
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - 6 + 7) % 7));
  return date.toISOString().slice(0, 10);
}

function weeksBefore(isoDate: string, weeks: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - weeks * 7);
  return date.toISOString().slice(0, 10);
}

const currentDate = lastPublicationDay();

export const CURRENT_EDITION: Edition = {
  id: 'e0',
  editionDate: currentDate,
  pageCount: 8,
  coverImageUrl: null,
  pdfUrl: null,
};

export const PREVIOUS_EDITIONS: readonly Edition[] = [1, 2, 3].map((weeks) => ({
  id: `e${weeks}`,
  editionDate: weeksBefore(currentDate, weeks),
  pageCount: 8,
  coverImageUrl: null,
  pdfUrl: null,
}));
