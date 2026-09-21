/**
 * Builds the application against the local harness — its URL and anon key
 * are inlined at build time, so this is a separate build in its own folder
 * and the ordinary `.next` build is left alone.
 */
import { spawnSync } from 'node:child_process';

import { ANON_KEY, APP_PORT, DIST_DIR, SUPABASE_URL } from './env.mjs';

const result = spawnSync('npx', ['next', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_DIST_DIR: DIST_DIR,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${APP_PORT}`,
  },
});
process.exit(result.status ?? 1);
