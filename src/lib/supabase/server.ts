import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { supabaseCredentials } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * Uses the anon key, so every query is still subject to row-level security —
 * the server is not privileged. Session tokens travel in cookies.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = supabaseCredentials();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Session refresh is handled by
          // middleware instead, so this is safe to ignore.
        }
      },
    },
  });
}
