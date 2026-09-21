'use client';

import { createBrowserClient } from '@supabase/ssr';

import { supabaseCredentials } from '@/lib/env';
import type { Database } from '@/types/database';

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser Supabase client. Memoised so one instance owns the auth session. */
export function createSupabaseBrowserClient() {
  if (!client) {
    const { url, anonKey } = supabaseCredentials();
    client = createBrowserClient<Database>(url, anonKey);
  }
  return client;
}
