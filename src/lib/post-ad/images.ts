import { MAX_ARTWORK_FILES, MAX_IMAGES } from '@/lib/post-ad/schema';
import type { SubmissionImage } from '@/types/submission';

/**
 * File handling for the submission form.
 *
 * NOTHING IS UPLOADED. Files stay in the browser as object URLs for the
 * duration of the form. When storage arrives — a Supabase bucket, most
 * likely — the seam is `prepareUpload` below: the form keeps producing
 * `SubmissionImage` values exactly as it does now, and that function gains a
 * body.
 *
 * The checks here are courtesy, not security. A browser reports a file's type
 * from its extension, and a determined client can report anything it likes,
 * so the upload endpoint must sniff the actual bytes, cap the size itself and
 * store files outside any path that could ever be served as HTML. Everything
 * below simply spares an honest advertiser a failed upload.
 */

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ARTWORK_TYPES = [...IMAGE_TYPES, 'application/pdf'] as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ARTWORK_BYTES = 15 * 1024 * 1024;

export interface FileRules {
  accept: readonly string[];
  maxBytes: number;
  maxFiles: number;
  /** For the `accept` attribute and the hint line. */
  label: string;
}

export const IMAGE_RULES: FileRules = {
  accept: IMAGE_TYPES,
  maxBytes: MAX_IMAGE_BYTES,
  maxFiles: MAX_IMAGES,
  label: 'JPG, PNG or WEBP, up to 5 MB each',
};

export const ARTWORK_RULES: FileRules = {
  accept: ARTWORK_TYPES,
  maxBytes: MAX_ARTWORK_BYTES,
  maxFiles: MAX_ARTWORK_FILES,
  label: 'JPG, PNG, WEBP or PDF, up to 15 MB each',
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPdf(image: SubmissionImage): boolean {
  return image.type === 'application/pdf';
}

export interface AcceptResult {
  accepted: SubmissionImage[];
  /** One message covering everything that was refused, or null. */
  error: string | null;
}

/**
 * Filters a picked or dropped file list against the rules.
 *
 * Good files are always kept: dropping five photographs of which one is a
 * spreadsheet adds the four and explains the one, rather than refusing the
 * lot.
 */
export function acceptFiles(
  files: readonly File[],
  existing: readonly SubmissionImage[],
  rules: FileRules,
): AcceptResult {
  const accepted: SubmissionImage[] = [];
  const problems: string[] = [];
  let room = rules.maxFiles - existing.length;

  for (const file of files) {
    if (room <= 0) {
      problems.push(`Only ${rules.maxFiles} files can be attached.`);
      break;
    }
    if (!rules.accept.includes(file.type)) {
      problems.push(`${file.name} is not an accepted file type.`);
      continue;
    }
    if (file.size > rules.maxBytes) {
      problems.push(`${file.name} is ${formatBytes(file.size)}, over the ${formatBytes(rules.maxBytes)} limit.`);
      continue;
    }
    if (file.size === 0) {
      problems.push(`${file.name} is empty.`);
      continue;
    }
    if (existing.some((item) => item.name === file.name && item.size === file.size)) {
      problems.push(`${file.name} has already been added.`);
      continue;
    }

    accepted.push(toSubmissionImage(file));
    room -= 1;
  }

  return {
    accepted,
    error: problems.length ? Array.from(new Set(problems)).join(' ') : null,
  };
}

function toSubmissionImage(file: File): SubmissionImage {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    previewUrl: URL.createObjectURL(file),
    name: file.name,
    size: file.size,
    type: file.type,
  };
}

/**
 * Releases object URLs.
 *
 * Every `createObjectURL` pins its blob in memory until it is revoked, so a
 * removed image, a reset form and an unmounting page all pass through here.
 */
export function releaseImages(images: readonly SubmissionImage[]): void {
  for (const image of images) {
    try {
      URL.revokeObjectURL(image.previewUrl);
    } catch {
      // Already revoked, or never a blob URL. Nothing to do.
    }
  }
}

/**
 * TODO(storage): upload the file and return the stored object's path.
 *
 * The intended shape: upload to a private bucket under
 * `submissions/<submission id>/<index>-<random>.<ext>`, let the server decide
 * the extension from sniffed content rather than the client's file name, and
 * return the path. The form does not change; only this function gains a body.
 */
export async function prepareUpload(image: SubmissionImage): Promise<string> {
  return Promise.resolve(image.previewUrl);
}
