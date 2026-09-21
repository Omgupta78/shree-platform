import { expect, test } from '@playwright/test';

/**
 * The account surface, without a database.
 *
 * Every check here is one that holds whether or not Supabase is configured,
 * which is the point: the site has to be walkable before the office has a
 * project, and the pages that would carry somebody's personal data have to be
 * safe in that state too — a `/my-ads` that rendered an empty list rather than
 * saying it is not connected would be a page that looks like an answer.
 */

test.describe('account pages', () => {
  test('the header offers a way in, and does not claim anybody is signed in', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Post an Advertisement' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  });

  test('sign in asks for an email address and a password, and nothing else', async ({ page }) => {
    await page.goto('/sign-in');

    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toHaveAttribute('type', 'email');
    await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
    await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'current-password');
  });

  test('the account pages are not offered to search engines', async ({ page }) => {
    for (const path of ['/sign-in', '/sign-up', '/forgot-password', '/update-password']) {
      await page.goto(path);
      const robots = page.locator('meta[name="robots"]');
      await expect(robots, `${path} should be noindex`).toHaveAttribute(
        'content',
        /noindex/,
      );
    }
  });

  test('sign up collects a name, an address and a password, and says the number is optional', async ({
    page,
  }) => {
    await page.goto('/sign-up');

    await expect(page.getByLabel('Your name')).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'new-password');

    // The number on an account is not the number on an advertisement, and the
    // form has to say so or people will assume it is published.
    await expect(page.getByText('This is not published')).toBeVisible();
  });

  test('a tampered return address is not carried into the form', async ({ page }) => {
    // `//evil.example` is a valid URL that navigates off-site. An open
    // redirect on a sign-in page is a phishing hop with the site's own domain
    // in front of it.
    await page.goto('/sign-in?next=//evil.example/steal');

    await expect(page.locator('input[name="next"]')).toHaveValue('/my-ads');
  });

  test('a relative return address is kept', async ({ page }) => {
    await page.goto('/sign-in?next=%2Fpost-ad');
    await expect(page.locator('input[name="next"]')).toHaveValue('/post-ad');
  });

  test('each account page has exactly one first-level heading', async ({ page }) => {
    for (const path of ['/sign-in', '/sign-up', '/forgot-password', '/update-password']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }), path).toHaveCount(1);
    }
  });

  test('signing out is not something a link can do', async ({ request }) => {
    const response = await request.get('/auth/sign-out', { maxRedirects: 0 });
    expect(response.status()).toBe(405);
  });

  test('an emailed link with no code lands on sign in rather than a blank page', async ({
    page,
  }) => {
    await page.goto('/auth/callback');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe('without a database', () => {
  test('my advertisements says it is not connected instead of showing an empty list', async ({
    page,
  }) => {
    await page.goto('/my-ads');

    await expect(page.getByText('Database not connected yet')).toBeVisible();
    // Not an empty list, which would read as "you have no advertisements".
    await expect(page.getByRole('heading', { name: 'My advertisements' })).toHaveCount(0);
  });

  test('the account pages say so above the form rather than hiding it', async ({ page }) => {
    await page.goto('/sign-in');

    await expect(page.getByText('Database not connected yet')).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
  });

  test('the sign-in form refuses rather than pretending', async ({ page }) => {
    await page.goto('/sign-in');

    await page.getByLabel('Email address').fill('someone@example.com');
    await page.getByLabel('Password').fill('a-long-enough-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Scoped to the form: Next.js keeps its own `role="alert"` route
    // announcer in the document, and an unscoped query matches both.
    await expect(page.locator('form').getByRole('alert')).toContainText(
      'without a database connection',
    );
    // And it has not navigated anywhere that would imply success.
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
