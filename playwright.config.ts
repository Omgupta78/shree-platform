import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end checks, run against a production build.
 *
 * `next build && next start` rather than `next dev`: the two differ in ways
 * that matter here — prerendering, the proxy, and which routes end up dynamic.
 * A suite that only ever sees the development server cannot tell you whether
 * the thing you are about to deploy works.
 *
 * These live in the repository on purpose. An earlier round of this work kept
 * its suites in a scratch directory outside the project; the scratch directory
 * went away and took every test with it.
 */
export default defineConfig({
  testDir: './e2e',
  // The database-backed suite has its own config: playwright.db.config.ts.
  testIgnore: ['db/**'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3400',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npx next start --port 3400',
        url: 'http://127.0.0.1:3400',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
