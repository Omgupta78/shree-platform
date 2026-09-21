import { defineConfig, devices } from '@playwright/test';

import { APP_PORT, DIST_DIR } from './e2e/db/harness/env.mjs';

/**
 * The admin and moderation flows, against a real database.
 *
 * `e2e/db/harness` stands up the pieces of Supabase the application talks to
 * on this machine: a Postgres built from the same migrations, a real
 * PostgREST in front of it (so every request goes through the same roles,
 * grants, RLS policies and database functions), and a small gateway that
 * answers password sign-in. The application is built separately into
 * `.next-db` with the harness's URL baked in — run `npm run e2e:db`.
 *
 * Serial, one worker: the tests share one database and several of them move
 * the same advertisement through its states in order.
 */
export default defineConfig({
  testDir: './e2e/db',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'bash e2e/db/harness/reset.sh',
      url: 'http://127.0.0.1:54321/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx next start --port ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}`,
      env: { NEXT_DIST_DIR: DIST_DIR },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
