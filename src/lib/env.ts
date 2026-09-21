import { z } from 'zod';

/**
 * Environment access.
 *
 * Public values are read as literal `process.env.X` expressions because Next.js
 * only inlines `NEXT_PUBLIC_*` variables when it can see them statically.
 *
 * Supabase credentials are optional rather than required so the app still
 * builds and renders before the database is connected — pages show an explicit
 * setup notice instead of crashing or, worse, showing invented data.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
});

const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

if (!parsed.success) {
  // A malformed value is a real misconfiguration and should fail loudly;
  // a missing value is handled by `isSupabaseConfigured` below.
  throw new Error(
    `Invalid environment configuration:\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;

export const isSupabaseConfigured =
  Boolean(env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Absolute origin, used for canonical URLs, sitemaps and share links. */
export function siteUrl(): string {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/**
 * Supabase credentials, asserted present. Call only from code paths already
 * guarded by `isSupabaseConfigured`.
 */
export function supabaseCredentials(): { url: string; anonKey: string } {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return { url, anonKey };
}
