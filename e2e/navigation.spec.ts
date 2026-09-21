import { expect, test } from '@playwright/test';

import { PLANNED_NAV, PRIMARY_NAV, LEGAL_NAV } from '../src/config/navigation';

/**
 * The site's own menus, walked.
 *
 * This suite exists because eight links in the header and footer — on every
 * page of the site — answered 404 for several phases without anything
 * noticing. A typecheck cannot catch it, a build cannot catch it, and the
 * page they point at renders perfectly well; only asking the server does.
 *
 * `config/navigation.ts` carries a `built` flag per link. What is asserted
 * here is that the flag tells the truth in both directions: a link the site
 * shows must resolve, and a link it hides must be one that genuinely does not
 * exist yet. The second half matters as much as the first — without it, a page
 * could be written and the flag never flipped, and the menu item would stay
 * hidden with nobody the wiser.
 */

test.describe('the public navigation', () => {
  test('every link the site shows resolves', async ({ page, request }) => {
    await page.goto('/');

    const hrefs = await page
      .locator('header a[href^="/"], footer a[href^="/"]')
      .evaluateAll((nodes) =>
        Array.from(new Set(nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? ''))),
      );

    expect(hrefs.length).toBeGreaterThan(3);

    const broken: string[] = [];
    for (const href of hrefs) {
      const response = await request.get(href, { maxRedirects: 3 });
      if (response.status() >= 400) broken.push(`${href} → ${response.status()}`);
    }

    expect(broken, 'header and footer links that do not resolve').toEqual([]);
  });

  test('a link marked built has a page, and one marked unbuilt does not', async ({ request }) => {
    const wrong: string[] = [];

    for (const link of PLANNED_NAV) {
      const response = await request.get(link.href, { maxRedirects: 3 });
      const exists = response.status() < 400;

      if (link.built && !exists) {
        wrong.push(`${link.href} is marked built but answers ${response.status()}`);
      }
      if (!link.built && exists) {
        // The page has been written. Flip `built` so the menu shows it.
        wrong.push(`${link.href} now exists — set built: true in config/navigation.ts`);
      }
    }

    expect(wrong, 'navigation flags that disagree with the routes').toEqual([]);
  });

  test('nothing unbuilt is rendered', () => {
    expect(PRIMARY_NAV.every((link) => link.built)).toBe(true);
    expect(LEGAL_NAV.every((link) => link.built)).toBe(true);
  });
});
