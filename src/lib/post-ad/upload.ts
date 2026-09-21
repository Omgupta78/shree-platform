import 'server-only';

import { MAX_ARTWORK_BYTES, MAX_IMAGE_BYTES } from '@/lib/post-ad/images';

/**
 * What the bytes actually are.
 *
 * `lib/post-ad/images.ts` checks `file.type`, which is the browser's opinion
 * derived from the file name — helpful to an honest advertiser, worth nothing
 * against anyone else, since a request can claim any type it likes. This
 * module reads the first bytes and decides for itself, and the extension the
 * file is stored under comes from that decision rather than from the name the
 * client sent.
 *
 * Why it matters here specifically: `ad-images` is a public bucket. A file
 * stored with an attacker-chosen name and type is a file served from the
 * site's own origin, which is how an "image" upload becomes stored HTML.
 */

export interface SniffedFile {
  contentType: string;
  extension: string;
}

const SIGNATURES: ReadonlyArray<{
  contentType: string;
  extension: string;
  matches: (bytes: Uint8Array) => boolean;
}> = [
  {
    contentType: 'image/jpeg',
    extension: 'jpg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    contentType: 'image/png',
    extension: 'png',
    matches: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    contentType: 'image/webp',
    extension: 'webp',
    // 'RIFF' …four bytes of length… 'WEBP'
    matches: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  {
    contentType: 'application/pdf',
    extension: 'pdf',
    // '%PDF-'
    matches: (b) =>
      b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d,
  },
];

export class UploadRejected extends Error {}

async function sniff(file: File): Promise<SniffedFile> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const found = SIGNATURES.find((signature) => signature.matches(header));
  if (!found) {
    throw new UploadRejected(`${file.name} is not a JPG, PNG, WEBP or PDF file.`);
  }
  return { contentType: found.contentType, extension: found.extension };
}

export interface AcceptedUpload extends SniffedFile {
  file: File;
  /** The name the advertiser gave it, kept for the office to refer to. */
  originalName: string;
  byteSize: number;
}

/**
 * Checks one file and decides how it will be stored.
 *
 * `allowed` is the list of content types this slot accepts, decided by the
 * server from which slot it is — photographs on a classified, artwork on a
 * display advertisement — and never from anything in the request.
 */
export async function acceptUpload(
  file: File,
  allowed: readonly string[],
  maxBytes: number,
): Promise<AcceptedUpload> {
  if (file.size === 0) throw new UploadRejected(`${file.name} is empty.`);
  if (file.size > maxBytes) {
    throw new UploadRejected(
      `${file.name} is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`,
    );
  }

  const sniffed = await sniff(file);
  if (!allowed.includes(sniffed.contentType)) {
    throw new UploadRejected(`${file.name} is not an accepted file type here.`);
  }

  return {
    ...sniffed,
    file,
    originalName: file.name.slice(0, 200),
    byteSize: file.size,
  };
}

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ARTWORK_TYPES = [...PHOTO_TYPES, 'application/pdf'] as const;

export const PHOTO_MAX_BYTES = MAX_IMAGE_BYTES;
export const ARTWORK_MAX_BYTES = MAX_ARTWORK_BYTES;

/**
 * Where a file is stored.
 *
 * `<user id>/<advertisement id>/<index>-<random>.<ext>`. The first segment is
 * what the storage policies compare against `auth.uid()`, so the path is the
 * ownership record; the random middle means a file name cannot be guessed from
 * the advertisement alone; and the extension comes from the sniffed content,
 * so nothing the client named reaches the stored object.
 */
export function storagePath(
  userId: string,
  adId: string,
  index: number,
  extension: string,
): string {
  const random = crypto.randomUUID().slice(0, 8);
  return `${userId}/${adId}/${index}-${random}.${extension}`;
}
