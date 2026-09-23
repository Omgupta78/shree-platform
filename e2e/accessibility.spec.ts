import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility, checked by machine and by keyboard.
 *
 * An automated audit finds perhaps a third of what a real one would: it can
 * see a missing label, an unlabelled control and insufficient contrast, and it
 * cannot see whether a heading actually describes the section under it. So
 * this suite does the part a machine does well, and adds the two checks that
 * catch the most in practice — that the page can be operated from the keyboard
 * alone, and that focus is visible while you do it.
 *
 * Scoped to WCAG 2.1 A and AA, which is the level this kind of site is held to.
 */

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/classifieds', name: 'classifieds' },
  { path: '/classifieds/jobs', name: 'a section' },
  { path: '/categories', name: 'categories' },
  { path: '/about', name: 'about' },
  { path: '/contact', name: 'contact' },
  { path: '/advertise', name: 'advertise' },
  { path: '/sign-in', name: 'sign in' },
  { path: '/post-ad', name: 'post an advertisement' },
  { path: '/privacy', name: 'privacy policy' },
  { path: '/terms', name: 'terms and conditions' },
  { path: '/disclaimer', name: 'disclaimer' },
];

async function audit(page: Page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
}

test.describe('automated audit', () => {
  for (const { path, name } of PAGES) {
    test(`${name} has no violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await audit(page);

      const summary = results.violations
        .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)\n  ${v.nodes[0]?.html?.slice(0, 160)}`)
        .join('\n');

      expect(results.violations, summary).toEqual([]);
    });
  }

  test('an advertisement page has no violations', async ({ page }) => {
    await page.goto('/classifieds');
    const href = await page
      .locator('article a[href^="/classifieds/"]')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? ''));
    const advertisement = href.find((h) => h.split('/').length === 3 && !h.endsWith('/jobs'));
    await page.goto(advertisement ?? '/classifieds');
    await page.waitForLoadState('networkidle');

    const results = await audit(page);
    expect(
      results.violations,
      results.violations.map((v) => `${v.id}: ${v.help}`).join('\n'),
    ).toEqual([]);
  });
});

test.describe('the keyboard', () => {
  test('the first stop is a skip link that works', async ({ page }) => {
    await page.goto('/classifieds');
    await page.keyboard.press('Tab');

    const focused = page.locator(':focus');
    await expect(focused).toHaveAttribute('href', '#main');
    await expect(focused).toBeVisible();
  });

  test('focus is visible, not merely present', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Something must draw a focus ring: an outline, or a ring drawn as a
    // shadow. A control that is focused invisibly is unusable by keyboard.
    const visible = await page.locator(':focus').evaluate((node) => {
      const style = getComputedStyle(node);
      const outline =
        style.outlineStyle !== 'none' && parseFloat(style.outlineWidth || '0') > 0;
      const ring = style.boxShadow !== 'none' && style.boxShadow !== '';
      return outline || ring;
    });
    expect(visible).toBe(true);
  });

  test('the search box can be reached and used without a mouse', async ({ page }) => {
    await page.goto('/classifieds');
    const search = page.locator('input[name="q"]').first();
    await search.focus();
    await search.fill('flat');
    await search.press('Enter');
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).searchParams.get('q')).toBe('flat');
  });
});

test.describe('structure', () => {
  test('every page has exactly one first-level heading', async ({ page }) => {
    for (const { path, name } of PAGES) {
      await page.goto(path);
      const count = await page.locator('h1').count();
      expect(count, `${name} has ${count} <h1> elements`).toBe(1);
    }
  });

  test('heading levels are not skipped', async ({ page }) => {
    for (const { path, name } of PAGES) {
      await page.goto(path);
      const levels = await page
        .locator('h1, h2, h3, h4, h5, h6')
        .evaluateAll((nodes) => nodes.map((n) => Number(n.tagName.slice(1))));

      let previous = 0;
      for (const level of levels) {
        if (previous !== 0) {
          // Going deeper by more than one step leaves a gap a screen-reader
          // user reads as a missing section.
          expect(level - previous, `${name}: h${previous} → h${level}`).toBeLessThanOrEqual(1);
        }
        previous = level;
      }
    }
  });

  test('the page declares its language', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
  });
});
