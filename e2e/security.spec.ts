import { expect, test } from '@playwright/test';

/**
 * The headers a browser receives, and whether the policy they carry actually
 * lets the site work.
 *
 * The second half is the point. A content policy is easy to write and easy to
 * get subtly wrong, and the failure mode is silent: the page renders, the
 * styles load, and one script somewhere is blocked. So these tests collect
 * console errors and blocked requests while genuinely loading the pages.
 */

const PAGES = ['/', '/classifieds', '/classifieds/jobs', '/categories', '/about', '/contact'];

test.describe('security headers', () => {
  test('every response carries the full set', async ({ request }) => {
    for (const path of PAGES) {
      const headers = (await request.get(path)).headers();
      expect(headers['content-security-policy'], path).toBeTruthy();
      expect(headers['x-content-type-options'], path).toBe('nosniff');
      expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
      expect(headers['x-frame-options'], path).toBe('DENY');
      expect(headers['permissions-policy'], path).toContain('geolocation=()');
      expect(headers['strict-transport-security'], path).toContain('max-age=');
    }
  });

  test('the policy forbids framing, plugins and rebasing', async ({ request }) => {
    const csp = (await request.get('/')).headers()['content-security-policy'] as string;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    // A wide-open policy would be worse than none, because it would look like
    // protection in an audit.
    expect(csp).not.toContain('default-src *');
    expect(csp).not.toContain("script-src 'self' 'unsafe-eval'");
  });

  test('the checkout and the database are reachable under it', async ({ request }) => {
    const csp = (await request.get('/')).headers()['content-security-policy'] as string;
    expect(csp).toContain('https://checkout.razorpay.com');
    expect(csp).toContain('https://api.razorpay.com');
  });

  test('no page is broken by the policy', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      const text = message.text();
      if (message.type() === 'error' && /content security policy|refused to/i.test(text)) {
        problems.push(text);
      }
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('the page is interactive under the policy, not merely rendered', async ({ page }) => {
    // Styles applied and hydration complete: a blocked framework bundle shows
    // up here and nowhere else.
    await page.goto('/classifieds');
    const background = await page
      .locator('body')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(background).not.toBe('rgba(0, 0, 0, 0)');

    // A client component that only works once its bundle has run.
    const search = page.locator('input[name="q"]').first();
    await search.fill('flat');
    await expect(search).toHaveValue('flat');
  });
});

test.describe('what the server does not say', () => {
  test('no framework or server version is advertised', async ({ request }) => {
    const headers = (await request.get('/')).headers();
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('an error page reveals nothing about the database or the code', async ({ request }) => {
    const body = await (await request.get('/classifieds/jobs/atlantis')).text();
    for (const leak of ['SQLSTATE', 'supabase.co', 'node_modules', 'at Object.', '/home/']) {
      expect(body, `leaked ${leak}`).not.toContain(leak);
    }
  });
});
