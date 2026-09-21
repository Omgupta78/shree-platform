import { expect, test } from '@playwright/test';

/**
 * The office, seen from outside it.
 *
 * What can be checked here is narrow, and worth being honest about: without a
 * Supabase project there are no accounts, so these tests cannot sign in as a
 * moderator and approve something. The three checks that matter — that a
 * non-staff account is refused, that the moderation views return nothing to
 * them, and that every transition is enforced — are in
 * `supabase/test/moderation_checks.sql`, where they run against a real
 * Postgres with real row-level security.
 *
 * What this file covers is the other half: that nothing about the office leaks
 * to somebody who simply types the URL, and that the pages refuse rather than
 * rendering an empty version of themselves. An admin page that showed a
 * dashboard of zeroes to a stranger would be a worse failure than one that
 * errored, because it would look like it had worked.
 */

const ADMIN_ROUTES = [
  '/admin',
  '/admin/advertisements',
  '/admin/advertisements/pending',
  '/admin/advertisements/approved',
  '/admin/advertisements/rejected',
  '/admin/advertisements/expired',
  '/admin/advertisements/changes-requested',
  '/admin/reports',
  '/admin/users',
  '/admin/categories',
  '/admin/activity',
];

test.describe('the admin area', () => {
  test('no admin route renders a queue or a dashboard to a stranger', async ({ page }) => {
    for (const route of ADMIN_ROUTES) {
      await page.goto(route);

      // The sidebar is the giveaway: if it rendered, the layout let somebody in.
      await expect(page.getByRole('navigation', { name: 'Admin' }), route).toHaveCount(0);
      await expect(page.getByRole('table'), route).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Approve advertisement' }), route).toHaveCount(0);
    }
  });

  test('an admin route says what is wrong rather than showing an empty office', async ({
    page,
  }) => {
    await page.goto('/admin');

    // Without a database there is nothing to moderate and no accounts to check
    // a role against, and the page says exactly that.
    await expect(page.getByText('Database not connected yet')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0);
  });

  test('the admin area is not offered to search engines', async ({ page }) => {
    for (const route of ['/admin', '/admin/advertisements/pending', '/admin/users']) {
      await page.goto(route);
      await expect(page.locator('meta[name="robots"]'), route).toHaveAttribute(
        'content',
        /noindex/,
      );
    }
  });

  test('the public header offers no way into the office', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  });

  test('posting at an admin route gets the refusal, not the office', async ({ request }) => {
    /*
     * A POST at a page route with no Next.js action header is not a Server
     * Action — the framework just renders the page — so the status is 200 and
     * the interesting question is what came back. It must be the same refusal
     * a GET gets, with none of the office in it.
     *
     * The real defences are elsewhere and are tested elsewhere: the action
     * itself calls `requireStaff()`, and `moderate_advertisement()` re-checks
     * `is_staff()` inside Postgres. Those are asserted against a live database
     * in `supabase/test/moderation_checks.sql`.
     */
    const response = await request.post('/admin/advertisements/pending', {
      headers: { 'content-type': 'application/json' },
      data: { action: 'approve' },
    });

    const body = await response.text();

    // The page's <title> still says "Pending review" — metadata is exported by
    // the route module and is evaluated whatever the layout then decides. A
    // route name is not a secret, and the queue itself is what must not
    // appear: no filter form, no table, no decision.
    expect(body, 'no filter form may be rendered').not.toContain(
      'Reference, title, advertiser, email or phone',
    );
    expect(body, 'no moderation control may be rendered').not.toContain('Approve advertisement');
    expect(body, 'no advertiser details may be rendered').not.toContain('Advertiser');
  });
});
