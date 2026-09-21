import { expect, test, type Page } from '@playwright/test';

import { CATEGORIES } from '../../src/config/categories';
import { LOCATIONS } from '../../src/config/locations';
import { ANON_KEY, SUPABASE_URL, USERS } from './harness/env.mjs';

/**
 * The office, end to end, against a real database.
 *
 * Runs in order: the approve / reject / request-changes tests move the seeded
 * advertisements through their states, and the public-visibility checks after
 * them depend on those decisions having landed.
 */
test.describe.configure({ mode: 'serial' });

type Who = keyof typeof USERS;

async function signIn(page: Page, who: Who, next = '/admin') {
  await page.context().clearCookies();
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address').fill(USERS[who].email);
  await page.getByLabel('Password').fill(USERS[who].password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname !== '/sign-in');
}

function row(page: Page, title: string) {
  return page.getByRole('row').filter({ hasText: title });
}

async function openReview(page: Page, queue: string, title: string) {
  await page.goto(queue);
  await row(page, title).getByRole('link', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

async function rest(path: string, token = ANON_KEY, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function tokenFor(who: Who): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: USERS[who].email, password: USERS[who].password }),
  });
  return (await response.json()).access_token as string;
}

/* ------------------------------------------------------------- access -- */

test('somebody signed out is sent to sign in', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin/);
});

test('an ordinary advertiser is turned away from /admin', async ({ page }) => {
  await signIn(page, 'advertiser', '/my-ads');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/my-ads\?error=not-staff/);

  await page.goto('/admin/advertisements/pending');
  await expect(page).toHaveURL(/\/my-ads\?error=not-staff/);
  // They land on their own page — which lists their own advertisement, but
  // none of the office around it.
  await expect(page.getByRole('searchbox', { name: 'Search advertisements' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve advertisement' })).toHaveCount(0);
});

test('a malicious client cannot approve its own advertisement through the API', async () => {
  const token = await tokenFor('advertiser');

  const direct = await rest('ads?title=eq.Harness%20pending%20flat%20to%20approve', token, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'approved' }),
  });
  expect(direct.status).toBeGreaterThanOrEqual(400);

  const viaFunction = await rest('rpc/moderate_advertisement', token, {
    method: 'POST',
    body: JSON.stringify({
      p_ad_id: '00000000-0000-4000-8000-000000000000',
      p_action: 'approve',
      p_note: null,
    }),
  });
  expect(viaFunction.status).toBeGreaterThanOrEqual(400);

  const staffView = await rest('moderation_ads?select=id', token);
  expect(await staffView.json()).toEqual([]);
});

/* ---------------------------------------------------------- dashboard -- */

test('the dashboard counts come from the database', async ({ page }) => {
  await signIn(page, 'admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  const stat = (label: string) => page.locator('main dl > a').filter({ has: page.getByText(label, { exact: true }) });
  await expect(stat('Pending')).toContainText('3');
  // The shop, the expiring flat and the long-run office. The lapsed sofa is
  // past its date, so it counts as expired even before the sweep reaches it.
  await expect(stat('Approved')).toContainText('3');
  await expect(stat('Rejected')).toContainText('1');
  await expect(stat('Expired')).toContainText('2');
  await expect(stat('Expiring soon')).toContainText('1');
  await expect(stat('Total users')).toContainText('3');
  await expect(stat('Today’s submissions')).toContainText('9');

  await expect(page.getByRole('main').getByText(/^Harness /).first()).toBeVisible();

  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(
    page.getByRole('region', { name: 'Notifications' }).getByRole('link', { name: '3 advertisements are waiting for review.' }),
  ).toBeVisible();
});

test('the pending queue lists the waiting advertisements with the agreed columns', async ({ page }) => {
  await signIn(page, 'moderator', '/admin/advertisements/pending');
  await page.goto('/admin/advertisements/pending');

  for (const heading of ['Reference', 'Title', 'Category', 'Location', 'Advertiser', 'Status']) {
    await expect(page.getByRole('columnheader', { name: heading })).toBeVisible();
  }
  for (const title of [
    'Harness pending flat to approve',
    'Harness pending scooter to reject',
    'Harness pending tuition to send back',
  ]) {
    await expect(row(page, title)).toHaveCount(1);
  }
  await expect(row(page, 'Harness approved shop listing')).toHaveCount(0);
});

test('search finds an advertisement by telephone digits and by reference', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/advertisements?q=90000%2000001');
  await expect(row(page, 'Harness approved shop listing')).toHaveCount(1);
  await page.goto('/admin/advertisements?q=SC1000');
  await expect(row(page, 'Harness approved shop listing')).toHaveCount(1);

  await page.goto('/admin/advertisements?q=scooter');
  await expect(row(page, 'Harness pending scooter to reject')).toHaveCount(1);
  await expect(row(page, 'Harness pending flat to approve')).toHaveCount(0);
});

/* --------------------------------------------------------- moderation -- */

test('a pending advertisement is private until it is approved', async ({ page, request }) => {
  const listing = await request.get('/classifieds');
  expect(await listing.text()).not.toContain('Harness pending flat to approve');

  const rows = await (await rest('public_ads?select=title')).json();
  const titles = (rows as Array<{ title: string }>).map((r) => r.title).sort();
  expect(titles).toEqual([
    'Harness approved shop listing',
    'Harness expiring flat listing',
    'Harness long run office listing',
  ]);

  await page.goto('/classifieds');
  await expect(page.getByText('Harness approved shop listing').first()).toBeVisible();
});

test('approving asks for confirmation, then publishes', async ({ page }) => {
  await signIn(page, 'moderator');
  await openReview(page, '/admin/advertisements/pending', 'Harness pending flat to approve');

  await page.getByRole('button', { name: 'Approve advertisement' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Are you sure you want to approve this advertisement?');
  await dialog.getByRole('button', { name: 'Approve advertisement' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Office Moderator').first()).toBeVisible();

  const rows = (await (await rest('public_ads?select=title')).json()) as Array<{ title: string }>;
  expect(rows.map((r) => r.title)).toContain('Harness pending flat to approve');

  await page.goto('/classifieds');
  await expect(page.getByText('Harness pending flat to approve').first()).toBeVisible();
});

test('rejecting needs a reason, and the reason is kept', async ({ page }) => {
  await signIn(page, 'moderator');
  await openReview(page, '/admin/advertisements/pending', 'Harness pending scooter to reject');

  await page.getByRole('button', { name: 'Reject advertisement' }).click();
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Reject advertisement' });
  await expect(confirm).toBeDisabled();

  await dialog.getByLabel('Suspected fraud').check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText('The advertiser has been told:')).toBeVisible();
  await expect(page.getByText(/Suspected fraud/).first()).toBeVisible();

  await page.goto('/admin/advertisements/rejected');
  const rejected = row(page, 'Harness pending scooter to reject');
  await expect(rejected).toContainText('Suspected fraud');
  await expect(rejected).toContainText('Office Moderator');

  const rows = (await (await rest('public_ads?select=title')).json()) as Array<{ title: string }>;
  expect(rows.map((r) => r.title)).not.toContain('Harness pending scooter to reject');
});

test('requesting changes sends it back with a message', async ({ page }) => {
  await signIn(page, 'moderator');
  await openReview(page, '/admin/advertisements/pending', 'Harness pending tuition to send back');

  await page.getByRole('button', { name: 'Request changes' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Please provide the property location.').check();
  await dialog.getByRole('button', { name: 'Request changes' }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/admin/advertisements/changes-requested');
  await expect(row(page, 'Harness pending tuition to send back')).toHaveCount(1);
});

test('the review page shows the history of every decision', async ({ page }) => {
  await signIn(page, 'admin');
  await openReview(page, '/admin/advertisements/rejected', 'Harness pending scooter to reject');

  const history = page.locator('section').filter({ has: page.getByRole('heading', { name: 'History' }) });
  await expect(history).toContainText('Office Moderator');
  await expect(history).toContainText('pending → rejected');
  await expect(history).toContainText('Suspected fraud');
});

test('a rejected advertisement can be restored to review, not straight to live', async ({ page }) => {
  await signIn(page, 'admin');
  await openReview(page, '/admin/advertisements/rejected', 'Harness rejected plot listing');

  await expect(page.getByRole('button', { name: 'Approve advertisement' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Restore for review' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore for review' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.goto('/admin/advertisements/pending');
  await expect(row(page, 'Harness rejected plot listing')).toHaveCount(1);
});

test('staff can correct the wording, and the correction is recorded', async ({ page }) => {
  await signIn(page, 'moderator');
  await openReview(page, '/admin/advertisements/pending', 'Harness rejected plot listing');

  await page.getByRole('button', { name: 'Edit advertisement' }).click();
  await page.getByLabel('Title').fill('Harness corrected plot listing');
  const save = page.getByRole('button', { name: 'Save correction' });
  await expect(save).toBeDisabled();
  await page.getByLabel('What you changed, and why').fill('Fixed the title wording.');
  await save.click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Harness corrected plot listing' }),
  ).toBeVisible();
  await expect(page.getByText('Fixed the title wording.').first()).toBeVisible();
});

test('the expired list shows finished advertisements, lapsed ones included', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/advertisements/expired');
  const expired = row(page, 'Harness expired bicycle listing');
  await expect(expired).toHaveCount(1);
  await expect(row(page, 'Harness lapsed sofa listing')).toHaveCount(1);
  // No renewal has been asked for, so there is nothing to review yet.
  await expect(expired.getByRole('link', { name: 'Review renewal' })).toHaveCount(0);

  const rows = (await (await rest('public_ads?select=title')).json()) as Array<{ title: string }>;
  expect(rows.map((r) => r.title)).not.toContain('Harness expired bicycle listing');
});

/* ------------------------------------------------------------ reports -- */

test('a report can be resolved without touching the advertisement', async ({ page }) => {
  await signIn(page, 'moderator');
  await page.goto('/admin/reports');
  const report = row(page, 'Harness approved shop listing');
  await expect(report).toContainText('Harness report: the price looks wrong.');

  await report.getByRole('button', { name: 'Resolve' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Resolve it' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  // It leaves the open list and appears under Resolved, with who closed it.
  await expect(report).toHaveCount(0);
  await page.goto('/admin/reports?status=actioned');
  await expect(row(page, 'Harness approved shop listing')).toContainText('Closed');

  const rows = (await (await rest('public_ads?select=title')).json()) as Array<{ title: string }>;
  expect(rows.map((r) => r.title)).toContain('Harness approved shop listing');
});

/* ----------------------------------------------------- administrators -- */

test('categories and users are for administrators only', async ({ page }) => {
  await signIn(page, 'moderator');
  await page.goto('/admin/categories');
  await expect(page.getByText('Administrators only')).toBeVisible();
  await page.goto('/admin/users');
  await expect(page.getByText('Administrators only')).toBeVisible();

  await signIn(page, 'admin');
  await page.goto('/admin/users');
  await expect(row(page, 'advertiser@shree.test')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /make.*admin/i })).toHaveCount(0);

  await page.goto('/admin/categories');
  await expect(page.getByText('Property').first()).toBeVisible();
});

test('every category and location the site offers exists in the database', async () => {
  const categories = (await (await rest('categories?select=slug')).json()) as Array<{ slug: string }>;
  const locations = (await (await rest('locations?select=slug')).json()) as Array<{ slug: string }>;
  const categorySlugs = new Set(categories.map((c) => c.slug));
  const locationSlugs = new Set(locations.map((l) => l.slug));

  for (const category of CATEGORIES) expect(categorySlugs, category.slug).toContain(category.slug);
  for (const location of LOCATIONS) expect(locationSlugs, location.slug).toContain(location.slug);
});

/* ------------------------------------------------------------- mobile -- */

test('the admin works on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  // Wide tables scroll inside their own box; the page itself never scrolls
  // sideways. Measured after hydration, which is when an escaping element
  // would show up.
  for (const path of ['/admin', '/admin/advertisements', '/admin/users', '/admin/reports?status=all']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, path).toBeLessThanOrEqual(390);
  }
  await page.goto('/admin');

  await page.getByRole('button', { name: 'Open the admin menu' }).click();
  await page.getByRole('link', { name: /Pending review/ }).click();
  await expect(page).toHaveURL(/\/admin\/advertisements\/pending/);
  await expect(page.getByRole('button', { name: 'Close the menu' })).toHaveCount(0);
});
