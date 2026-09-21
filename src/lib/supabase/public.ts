import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { supabaseCredentials } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * A Supabase client with no session at all.
 *
 * The server client in `server.ts` reads cookies, which ties it to a request.
 * `generateStaticParams` and `sitemap.ts` run at build time, where there is no
 * request and calling `cookies()` throws — so they need a client that carries
 * no identity.
 *
 * That is not merely a workaround. A sitemap built from whatever session
 * happened to be present could list an advertisement only that person can see.
 * This client is anonymous, so what it reads is exactly what a stranger with
 * the URL would read.
 */
export function createSupabaseAnonClient() {
  const { url, anonKey } = supabaseCredentials();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
