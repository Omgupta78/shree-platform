import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { supabaseCredentials } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Service-role client. Bypasses row-level security entirely.
 *
 * `server-only` makes importing this from a Client Component a build error, so
 * the key can never reach the browser. Reserved for scheduled maintenance and
 * webhook handlers (Phase 5); ordinary request handling must use the server
 * client so RLS still applies.
 */
export function createSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  }
  const { url } = supabaseCredentials();

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
