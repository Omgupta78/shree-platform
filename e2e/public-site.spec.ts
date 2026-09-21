import { expect, test, type Page } from '@playwright/test';

/**
 * Opens the first advertisement on the listing page.
 *
 * Via the card's own heading link: a card also carries links to its category
 * and its location, and `a[href^="/classifieds/"]` picks up all three.
 */
async function openFirstAdvertisement(page: Page) {
  await page.goto('/classifieds');
  const heading = page.locator('article h3 a').first();
  await heading.waitFor();
  await heading.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/**
 * The reading side of the site, and the two things Phase 6 added to it: the
 * report form, and view counting.
 *
 * Without Supabase the pages are served from the fictional development
 * dataset. Both of those features are honest about that rather than showing a
 * thank-you for something that went nowhere.
 */

test.describe('browsing', () => {
  test('the classifieds page lists advertisements', async ({ page }) => {
    await page.goto('/classifieds');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const cards = page.locator('article');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('a filter is carried in the URL, so a filtered view can be shared', async ({ page }) => {
    await page.goto('/classifieds?sort=oldest');
    await expect(page).toHaveURL(/sort=oldest/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a category slug resolves to a category page, not an advertisement', async ({ page }) => {
    await page.goto('/classifieds/jobs');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // A category page lists; an advertisement page does not.
    expect(await page.locator('article h3 a').count()).toBeGreaterThan(0);
  });

  test('an unknown slug shows a not-found page, not an error', async ({ page }) => {
    // Deliberately asserting what a reader sees rather than the status code.
    // Next.js 16.3.5 swallows `notFound()` from a Server Component, so this
    // answers 200 with the not-found panel rendered. The day that is fixed,
    // this test still passes and the assertion can be tightened to a 404.
    await page.goto('/classifieds/no-such-advertisement-exists-here');

    await expect(
      page.getByRole('heading', { name: /Advertisement Not Found/i }),
    ).toBeVisible();
  });

  test('the sitemap and robots file are served', async ({ request }) => {
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain('<urlset');

    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
  });
});

test.describe('an advertisement page', () => {
  test('shows the reference, the contact actions and the report control', async ({ page }) => {
    await openFirstAdvertisement(page);

    await expect(page.getByText(/SC\d{6}/).first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Report this advertisement/i }),
    ).toBeVisible();
  });

  test('the report form says what is wrong rather than thanking you for nothing', async ({
    page,
  }) => {
    await openFirstAdvertisement(page);

    await page.getByRole('button', { name: /Report this advertisement/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('radio', { name: 'Spam' }).check();
    await page.getByRole('button', { name: 'Submit report' }).click();

    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
      'not available yet',
    );
    await expect(page.getByText('Thank you')).toHaveCount(0);
  });

  test('the report dialog closes on Escape and returns focus to its trigger', async ({ page }) => {
    await openFirstAdvertisement(page);

    const trigger = page.getByRole('button', { name: /Report this advertisement/i });
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test.describe('posting', () => {
  test('the form is open to a visitor who is not signed in', async ({ page }) => {
    // The gate is on submission, not on the form: nobody should lose eight
    // steps of typing to a login wall.
    await page.goto('/post-ad');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Post Your Advertisement',
    );
    await expect(page).toHaveURL(/\/post-ad/);
  });

  test('the first step asks which kind of advertisement it is', async ({ page }) => {
    await page.goto('/post-ad');

    await expect(page.getByText('Classified Advertisement')).toBeVisible();
    await expect(page.getByText('Display Advertisement')).toBeVisible();
  });
});
