import { expect, test } from '@playwright/test';

/**
 * The advertiser's own pages.
 *
 * As with the admin suite, what can be checked without a Supabase project is
 * narrow: there are no accounts, so no advertisement can be edited here. The
 * rules about who may edit what — that a stranger's id returns nothing, that a
 * finished advertisement is the office's to revive, that editing a live
 * advertisement returns it to the queue — are asserted against real row-level
 * security in `supabase/test/moderation_checks.sql`.
 *
 * What this file covers is that the edit page refuses rather than rendering a
 * form over nothing, which is the failure somebody would actually meet.
 */

const SOME_ID = '00000000-0000-4000-8000-000000000000';

test.describe('editing an advertisement', () => {
  test('the edit page says it is not connected rather than showing a form', async ({ page }) => {
    await page.goto(`/my-ads/${SOME_ID}/edit`);

    await expect(page.getByText('Database not connected yet')).toBeVisible();
    await expect(page.getByRole('button', { name: /Save/ })).toHaveCount(0);
    await expect(page.getByLabel('Title')).toHaveCount(0);
  });

  test('the edit page is not offered to search engines', async ({ page }) => {
    await page.goto(`/my-ads/${SOME_ID}/edit`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('no advertiser contact details reach the page', async ({ request }) => {
    // Whatever the page decides to render, it must never carry the fields an
    // edit form would be filled from — there is no session, so there is
    // nothing of anybody's to render.
    const response = await request.get(`/my-ads/${SOME_ID}/edit`);
    const body = await response.text();

    expect(body).not.toContain('How readers reach you');
    expect(body).not.toContain('Show my mobile number');
  });
});
