import { env } from '@/lib/env';

/** Supabase Storage bucket holding advertisement images. */
export const AD_IMAGE_BUCKET = 'ad-images';

/**
 * Builds the public URL for a stored image path.
 *
 * Constructed directly rather than through `supabase.storage.getPublicUrl()` so
 * it works in Server Components without instantiating a client, and returns
 * null when storage is not configured yet.
 */
export function publicImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const clean = path.replace(/^\/+/, '');
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${AD_IMAGE_BUCKET}/${clean}`;
}
