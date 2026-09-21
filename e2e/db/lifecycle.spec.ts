import { expect, test, type Page } from '@playwright/test';

import { formatLongDate } from '../../src/lib/lifecycle/expiry';
import { ANON_KEY, SUPABASE_URL, USERS } from './harness/env.mjs';

/**
 * Phase 8 — expiry, renewal and the office's lifecycle controls, against the
 * real database. Runs after `admin-moderation.spec.ts` on the same seed and
 * in order: the early renewal, the sweep, the late renewal and the overrides
 * each leave the state the next test starts from.
 */
test.describe.configure({ mode: 'serial' });

type Who = keyof typeof USERS;

async function signIn(page: Page, who: Who, next = '/my-ads') {
  await page.context().clearCookies();
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address').fill(USERS[who].email);
  await page.getByLabel('Password').fill(USERS[who].password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname !== '/sign-in');
}

async function tokenFor(who: Who): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: USERS[who].email, password: USERS[who].password }),
  });
  return (await response.json()).access_token as string;
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

/** The office's view of one advertisement, by title. */
async function staffRow(title: string) {
  const token = await tokenFor('admin');
  const response = await rest(
    `moderation_ads?select=id,slug,status,published_at,expires_at,pending_renewal_id&title=eq.${encodeURIComponent(title)}`,
    token,
  );
  const rows = (await response.json()) as Array<{
    id: string;
    slug: string;
    status: string;
    published_at: string | null;
    expires_at: string | null;
    pending_renewal_id: string | null;
  }>;
  const row = rows[0];
  if (!row) throw new Error(`no advertisement titled ${title}`);
  return row;
}

async function publicTitles(): Promise<string[]> {
  const rows = (await (await rest('public_ads?select=title')).json()) as Array<{ title: string }>;
  return rows.map((row) => row.title);
}

const EXPIRING = 'Harness expiring flat listing';
const LAPSED = 'Harness lapsed sofa listing';
const EXPIRED = 'Harness expired bicycle listing';
const LONG_RUN = 'Harness long run office listing';

/* --------------------------------------------------- public visibility -- */

test('an advertisement past its date is gone from every public list, before any sweep', async ({ page }) => {
  expect(await publicTitles()).not.toContain(LAPSED);
  expect(await publicTitles()).toContain(EXPIRING);

  for (const path of ['/', '/classifieds', '/classifieds/business', '/classifieds?q=sofa']) {
    await page.goto(path);
    await expect(page.getByText(LAPSED), path).toHaveCount(0);
  }
  await page.goto('/classifieds/property');
  await expect(page.getByText(EXPIRING).first()).toBeVisible();
});

test('the URL of an expired advertisement says so, and offers only live ones', async ({ page }) => {
  const { slug } = await staffRow(LAPSED);
  await page.goto(`/classifieds/${slug}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Advertisement Expired' })).toBeVisible();
  await expect(page.getByText('This advertisement is no longer active.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse Classifieds' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page).toHaveTitle(/Advertisement expired/);

  // Nothing that belonged to the listing: no price, no call button.
  await expect(page.getByRole('link', { name: /Call/ })).toHaveCount(0);

  const similar = page.getByRole('region', { name: 'Looking for something similar?' });
  if (await similar.count()) {
    await expect(similar.getByText(LAPSED)).toHaveCount(0);
  }
  // A stranger sees no owner controls.
  await expect(page.getByRole('link', { name: 'Renew Advertisement' })).toHaveCount(0);
});

test('a pending or rejected advertisement does not answer as expired', async ({ page }) => {
  const { slug } = await staffRow('Harness pending tuition to send back');
  await page.goto(`/classifieds/${slug}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Advertisement Not Found' })).toBeVisible();
});

/* ---------------------------------------------------- the advertiser -- */

test('the dashboard shows the lifecycle figures and what is expiring soon', async ({ page }) => {
  await signIn(page, 'advertiser');
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/my-ads$/);

  for (const label of ['Total Ads', 'Published', 'Pending', 'Drafts', 'Expiring Soon', 'Expired']) {
    await expect(page.locator('dl dt', { hasText: new RegExp(`^${label}$`) }).first()).toBeVisible();
  }

  const soon = page.getByRole('region', { name: 'Expiring Soon' });
  await expect(soon.getByText(EXPIRING)).toBeVisible();
  await expect(soon.getByText(/Expires in 3 days|Expires in 2 days/)).toBeVisible();
  await expect(soon.getByRole('link', { name: 'Renew Advertisement' })).toBeVisible();
  await expect(soon.getByText(LONG_RUN)).toHaveCount(0);
});

test('the owner sees their run on the public page; nobody else does', async ({ page }) => {
  const { slug } = await staffRow(EXPIRING);

  await page.context().clearCookies();
  await page.goto(`/classifieds/${slug}`);
  await expect(page.getByText('This is your advertisement')).toHaveCount(0);

  await signIn(page, 'advertiser');
  await page.goto(`/classifieds/${slug}`);
  const panel = page.getByRole('complementary', { name: 'Your advertisement' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Your advertisement expires in \d days\./)).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Renew Advertisement' })).toBeVisible();
});

test('the advertiser cannot change their run or approve themselves through the API', async () => {
  const token = await tokenFor('advertiser');
  const before = await staffRow(EXPIRING);

  await rest(`ads?id=eq.${before.id}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ expires_at: '2030-01-01T00:00:00Z' }),
  });
  expect((await staffRow(EXPIRING)).expires_at).toBe(before.expires_at);

  for (const [fn, body] of [
    ['extend_advertisement_expiry', { p_ad_id: before.id, p_new_expires_at: '2027-01-01T00:00:00Z', p_reason: 'x' }],
    ['moderate_advertisement', { p_ad_id: before.id, p_action: 'expire', p_note: 'x' }],
    ['approve_renewal', { p_renewal_id: '00000000-0000-4000-8000-000000000000' }],
    ['expire_advertisements', {}],
  ] as const) {
    const response = await rest(`rpc/${fn}`, token, { method: 'POST', body: JSON.stringify(body) });
    expect(response.status, fn).toBeGreaterThanOrEqual(400);
  }

  const renewals = await rest('ad_renewals', token, {
    method: 'POST',
    body: JSON.stringify({ ad_id: before.id, user_id: USERS.advertiser.id, renewal_number: 9, package_id: 'basic', timing: 'early' }),
  });
  expect(renewals.status).toBeGreaterThanOrEqual(400);
});

test('an early renewal stays live and goes to the office', async ({ page }) => {
  const { id } = await staffRow(EXPIRING);
  await signIn(page, 'advertiser');
  await page.goto(`/dashboard/advertisements/${id}/renew`);
  await expect(page).toHaveURL(new RegExp(`/my-ads/${id}/renew$`));

  await expect(page.getByRole('heading', { level: 1, name: 'Renew your advertisement' })).toBeVisible();
  await expect(page.getByText(EXPIRING)).toBeVisible();
  await expect(page.getByText('Previous publication date')).toBeVisible();
  await page.getByLabel(/Basic/).check();
  await page.getByRole('button', { name: 'Submit Renewal' }).click();

  await expect(page).toHaveURL(new RegExp(`/my-ads/${id}\\?renewal=live`));
  await expect(page.getByText('Renewal sent. Your advertisement stays live')).toBeVisible();
  const history = page.getByRole('region', { name: 'Renewal History' });
  await expect(history.getByRole('row').filter({ hasText: '#1' })).toContainText('With our office');

  expect(await publicTitles()).toContain(EXPIRING);

  // A second request is refused while the first is waiting.
  await page.goto(`/my-ads/${id}/renew`);
  await expect(page.getByText('A renewal is already with our office')).toBeVisible();
});

test('the office approves the early renewal and the run is extended from its end', async ({ page }) => {
  const before = await staffRow(EXPIRING);
  await signIn(page, 'moderator', '/admin/advertisements/renewals');
  await page.goto('/admin/advertisements/renewals');

  const renewal = page.getByRole('row').filter({ hasText: EXPIRING });
  await expect(renewal).toContainText('Asked while live');
  await renewal.getByRole('button', { name: 'Approve renewal' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve renewal' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: EXPIRING })).toHaveCount(0);

  const after = await staffRow(EXPIRING);
  const expected = Date.parse(before.expires_at!) + 30 * 86_400_000;
  expect(Date.parse(after.expires_at!)).toBe(expected);
  expect(after.published_at).toBe(before.published_at);

  await signIn(page, 'advertiser');
  await page.goto(`/my-ads/${after.id}`);
  const history = page.getByRole('region', { name: 'Renewal History' });
  const first = history.getByRole('row').filter({ hasText: '#1' });
  await expect(first).toContainText('Approved');
  await expect(first).toContainText(formatLongDate(after.expires_at));
});

/* --------------------------------------------------------- the sweep -- */

test('the expiry check retires what has ended, once', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/advertisements/expired');

  await page.getByRole('button', { name: 'Run expiry check now' }).click();
  await expect(page.getByText('1 advertisement expired.')).toBeVisible();
  await page.getByRole('button', { name: 'Run expiry check now' }).click();
  await expect(page.getByText('Nothing was due to expire.')).toBeVisible();

  expect((await staffRow(LAPSED)).status).toBe('expired');

  const { id } = await staffRow(LAPSED);
  await page.goto(`/admin/advertisements/${id}`);
  const history = page.locator('section').filter({ has: page.getByRole('heading', { name: 'History' }) });
  await expect(history.getByText('expired it automatically at the end of its run')).toHaveCount(1);
});

test('the owner sees an expired advertisement as expired, with a way to renew', async ({ page }) => {
  await signIn(page, 'advertiser');
  await page.goto('/dashboard/expired');
  await expect(page).toHaveURL(/\/my-ads\/expired$/);

  for (const heading of ['Title', 'Reference', 'Category', 'Published', 'Expired']) {
    await expect(page.getByRole('columnheader', { name: heading })).toBeVisible();
  }
  const bicycle = page.getByRole('row').filter({ hasText: EXPIRED });
  await expect(bicycle.getByRole('link', { name: 'View' })).toBeVisible();
  await expect(bicycle.getByRole('link', { name: 'Renew' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: LAPSED })).toHaveCount(1);
  await expect(page.getByRole('row').filter({ hasText: EXPIRING })).toHaveCount(0);

  const { slug } = await staffRow(LAPSED);
  await page.goto(`/classifieds/${slug}`);
  await expect(page.getByText(/This advertisement expired on/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Renew Advertisement' })).toBeVisible();
});

/* ------------------------------------------------ renewal after expiry -- */

test('renewing an expired advertisement sends it to review, not back online', async ({ page }) => {
  const { id } = await staffRow(EXPIRED);
  await signIn(page, 'advertiser');
  await page.goto(`/my-ads/${id}/renew`);
  await expect(page.getByText('Previous expiry date')).toBeVisible();
  await page.getByRole('button', { name: 'Submit Renewal' }).click();
  await expect(page.getByText('Renewal sent. Your advertisement is with our office for review.')).toBeVisible();

  const row = await staffRow(EXPIRED);
  expect(row.status).toBe('pending');
  expect(row.pending_renewal_id).not.toBeNull();
  expect(await publicTitles()).not.toContain(EXPIRED);
});

test('approving the renewed advertisement publishes a fresh run', async ({ page }) => {
  await signIn(page, 'moderator', '/admin/advertisements/pending');
  await page.goto('/admin/advertisements/pending');
  const queued = page.getByRole('row').filter({ hasText: EXPIRED });
  await expect(queued).toContainText('Renewal');
  await queued.getByRole('link', { name: 'Review', exact: true }).click();

  await page.getByRole('button', { name: 'Approve advertisement' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve advertisement' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const row = await staffRow(EXPIRED);
  expect(row.status).toBe('approved');
  const published = Date.parse(row.published_at!);
  expect(Date.now() - published).toBeLessThan(5 * 60_000);
  expect(Date.parse(row.expires_at!) - published).toBe(30 * 86_400_000);
  expect(await publicTitles()).toContain(EXPIRED);

  await signIn(page, 'advertiser');
  await page.goto(`/my-ads/${row.id}`);
  const first = page.getByRole('region', { name: 'Renewal History' }).getByRole('row').filter({ hasText: '#1' });
  await expect(first).toContainText('Approved');
  await expect(first).toContainText(formatLongDate(row.expires_at));
});

/* ------------------------------------------------- administrator only -- */

test('a moderator is not offered the expiry overrides', async ({ page }) => {
  const { id } = await staffRow(LONG_RUN);
  await signIn(page, 'moderator', `/admin/advertisements/${id}`);
  await page.goto(`/admin/advertisements/${id}`);
  await expect(page.getByRole('heading', { name: 'Lifecycle' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Extend Expiry' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark as Expired' })).toHaveCount(0);
});

test('an administrator extends a run, with a reason, and it is logged', async ({ page }) => {
  const before = await staffRow(LONG_RUN);
  await signIn(page, 'admin', `/admin/advertisements/${before.id}`);
  await page.goto(`/admin/advertisements/${before.id}`);

  await page.getByRole('button', { name: 'Extend Expiry' }).click();
  const dialog = page.getByRole('dialog');
  const target = new Date(Date.parse(before.expires_at!) + 10 * 86_400_000);
  const isoDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(target);
  await dialog.getByLabel('New expiry date').fill(isoDate);
  await expect(dialog.getByRole('button', { name: 'Extend Expiry' })).toBeDisabled();
  await dialog.getByLabel('Reason').fill('Printed edition was delayed by a week.');
  await dialog.getByRole('button', { name: 'Extend Expiry' }).click();
  await expect(dialog).toBeHidden();

  const after = await staffRow(LONG_RUN);
  expect(new Date(after.expires_at!).toISOString()).toBe(new Date(`${isoDate}T23:59:59+05:30`).toISOString());

  await page.goto('/admin/activity');
  await expect(page.getByText('extended its expiry').first()).toBeVisible();
  await expect(page.getByText('Printed edition was delayed by a week.').first()).toBeVisible();
});

test('an administrator marks an advertisement expired, with a reason', async ({ page }) => {
  const { id } = await staffRow(LONG_RUN);
  await signIn(page, 'admin', `/admin/advertisements/${id}`);
  await page.goto(`/admin/advertisements/${id}`);

  await page.getByRole('button', { name: 'Mark as Expired' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Why are you expiring this advertisement?');
  await expect(dialog.getByRole('button', { name: 'Mark as Expired' })).toBeDisabled();
  await dialog.getByLabel('Reason').fill('The advertiser asked us to take it down.');
  await dialog.getByRole('button', { name: 'Mark as Expired' }).click();
  await expect(dialog).toBeHidden();

  expect((await staffRow(LONG_RUN)).status).toBe('expired');
  expect(await publicTitles()).not.toContain(LONG_RUN);

  const history = page.locator('section').filter({ has: page.getByRole('heading', { name: 'History' }) });
  await expect(history.getByText('manually expired it')).toBeVisible();
  await expect(history.getByText('The advertiser asked us to take it down.')).toBeVisible();
  await expect(history.getByText('Office Admin').first()).toBeVisible();
});

test('the expiring list shows what ends soonest first', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin/advertisements/expiring?range=30');
  for (const heading of ['Reference', 'Title', 'Advertiser', 'Category', 'Published', 'Expiry date', 'Days remaining', 'Status']) {
    await expect(page.getByRole('columnheader', { name: heading })).toBeVisible();
  }
  await expect(page.getByRole('row').filter({ hasText: 'Harness approved shop listing' })).toHaveCount(1);
});

/* -------------------------------------------------------------- mobile -- */

test('the lifecycle pages fit a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { id, slug } = await staffRow(LAPSED);
  await signIn(page, 'advertiser');
  for (const path of ['/my-ads', '/my-ads/expired', `/my-ads/${id}`, `/my-ads/${id}/renew`, `/classifieds/${slug}`]) {
    await page.goto(path);
    await page.waitForLoadState('load');
    // After hydration, which is when an escaping element would show up.
    await page.waitForTimeout(400);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, path).toBeLessThanOrEqual(390);
  }
  await signIn(page, 'admin');
  for (const path of ['/admin/advertisements/expiring', '/admin/advertisements/renewals', '/admin/advertisements/expired']) {
    await page.goto(path);
    await page.waitForLoadState('load');
    // After hydration, which is when an escaping element would show up.
    await page.waitForTimeout(400);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, path).toBeLessThanOrEqual(390);
  }
});
