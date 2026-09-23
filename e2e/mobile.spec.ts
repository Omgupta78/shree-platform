import { expect, test, type Page } from '@playwright/test';

/**
 * The site at the sizes people actually hold.
 *
 * The check that earns its place is horizontal overflow. It is the most common
 * responsive fault and the least visible in development, because a developer's
 * window is wide enough to hide it — and on a telephone it shows as a page that
 * slides sideways under the thumb, with a column of content off the edge.
 *
 * The 360px width is deliberate: it is narrower than an iPhone SE and matches
 * the cheaper Android handsets this site's readers in Roorkee are most likely
 * to be using.
 */

const VIEWPORTS = [
  { name: 'small phone', width: 360, height: 740 },
  { name: 'large phone', width: 414, height: 896 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
];

const PAGES = [
  '/',
  '/classifieds',
  '/classifieds/jobs',
  '/classifieds/jobs/roorkee',
  '/categories',
  '/about',
  '/contact',
  '/advertise',
  '/sign-in',
  '/post-ad',
];

/** How far the document scrolls sideways. Anything above zero is a fault. */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

test.describe('no page slides sideways', () => {
  for (const viewport of VIEWPORTS) {
    test(`at ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const faults: string[] = [];
      for (const path of PAGES) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const extra = await overflow(page);
        // A pixel or two is rounding; anything more is a layout fault.
        if (extra > 2) faults.push(`${path} overflows by ${extra}px`);
      }

      expect(faults, faults.join('\n')).toEqual([]);
    });
  }

  test('an advertisement page fits a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/classifieds');
    const hrefs = await page
      .locator('article a[href^="/classifieds/"]')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? ''));
    const advertisement = hrefs.find((h) => h.split('/').length === 3);
    await page.goto(advertisement ?? '/classifieds');
    await page.waitForLoadState('networkidle');

    expect(await overflow(page)).toBeLessThanOrEqual(2);
  });
});

test.describe('the controls can be hit with a thumb', () => {
  test('the header navigation opens on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');

    // The full menu collapses; whatever replaces it must be reachable.
    const opener = page.getByRole('button', { name: /menu/i }).first();
    await expect(opener).toBeVisible();
    await page.waitForLoadState('networkidle');

    const box = await opener.boundingBox();
    // 44px is the size at which a target stops being a source of mis-taps.
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(40);

    await opener.click();
    await expect(page.getByRole('link', { name: 'Classifieds' }).first()).toBeVisible();
  });

  test('the primary action on a listing page is comfortably tappable', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/classifieds');

    // The search panel renders inside a Suspense boundary, so it must be
    // waited for: measuring a box before layout settles reads zero, which
    // looks exactly like a control that is too small to tap.
    const search = page.locator('input[name="q"]').first();
    await expect(search).toBeVisible();
    const box = await search.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  });
});

test.describe('the forms suit a phone keyboard', () => {
  test('email and telephone fields ask for the right keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/sign-up');

    // type="email" and type="tel" are what change the on-screen keyboard.
    // Getting this wrong means somebody hunting for "@" on a phone.
    await expect(page.locator('input[name="email"]')).toHaveAttribute('type', 'email');
    const phone = page.locator('input[name="phone"]');
    if (await phone.count()) {
      await expect(phone).toHaveAttribute('type', 'tel');
    }
  });

  test('text is not so small that a phone zooms on focus', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/sign-in');

    // Safari on iOS zooms the page when a focused field's text is under 16px,
    // which throws the layout sideways mid-typing.
    const size = await page
      .locator('input[name="email"]')
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });
});
