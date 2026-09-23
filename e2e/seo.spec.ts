import { expect, test } from '@playwright/test';

import { CATEGORIES } from '../src/config/categories';
import { SITE } from '../src/config/site';

/**
 * The tags a search engine actually receives.
 *
 * Asked of a running production build, because this is the half of SEO that
 * unit tests cannot reach: a metadata builder can return a perfect object and
 * the page can forget to call it, and from inside a unit test the two look the
 * same. Everything here is read out of the served HTML or the response status.
 *
 * The site under test runs on the offline dataset, so advertisement-specific
 * assertions are made against whichever advertisement the listing happens to
 * show rather than a fixed slug.
 */

async function head(page: import('@playwright/test').Page, selector: string, attr = 'content') {
  return page.locator(selector).first().getAttribute(attr);
}

/**
 * The address of the first advertisement on a listing page.
 *
 * Every `/classifieds/...` link has to be filtered against the known section
 * slugs rather than simply taken. The section rail at the top of the page
 * matches the same selector, and so does the category link INSIDE each listing
 * card — which comes before the advertisement's own link in the markup. An
 * earlier version of this helper took the first match and ended up asserting
 * that a section should have declared itself an article.
 */
const SECTION_PATHS = new Set(CATEGORIES.map((category) => `/classifieds/${category.slug}`));

async function firstAdvertisementHref(page: import('@playwright/test').Page): Promise<string> {
  const hrefs = await page
    .locator('article a[href^="/classifieds/"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
  const href = hrefs.find((candidate) => candidate && !SECTION_PATHS.has(candidate));
  expect(href, 'no advertisement on the listing page').toBeTruthy();
  return href as string;
}

test.describe('every public page carries its own metadata', () => {
  const pages = [
    { path: '/', name: 'home' },
    { path: '/classifieds', name: 'classifieds' },
    { path: '/categories', name: 'categories' },
    { path: '/about', name: 'about' },
    { path: '/advertise', name: 'advertise' },
    { path: '/contact', name: 'contact' },
    { path: `/classifieds/${CATEGORIES[0]?.slug}`, name: 'a section' },
    { path: '/privacy', name: 'privacy policy' },
    { path: '/terms', name: 'terms and conditions' },
    { path: '/disclaimer', name: 'disclaimer' },
  ];

  for (const { path, name } of pages) {
    test(`${name} has a title, description, canonical and share card`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveTitle(/\S/);
      expect(await head(page, 'meta[name="description"]')).toBeTruthy();

      const canonical = await head(page, 'link[rel="canonical"]', 'href');
      expect(canonical, 'canonical must be absolute').toMatch(/^https?:\/\//);
      expect(new URL(canonical as string).pathname).toBe(path);

      expect(await head(page, 'meta[property="og:title"]')).toContain(SITE.name);
      expect(await head(page, 'meta[property="og:image"]')).toBeTruthy();
      expect(await head(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    });
  }

  test('the pages do not all share one description', async ({ page }) => {
    const seen = new Set<string>();
    for (const { path } of pages) {
      await page.goto(path);
      const description = await head(page, 'meta[name="description"]');
      expect(description, `${path} has no description`).toBeTruthy();
      seen.add(description as string);
    }
    // Duplicate metadata across every page is the thing the brief asks us to
    // avoid; identical descriptions would collapse this set to one.
    expect(seen.size).toBeGreaterThan(1);
  });
});

test.describe('structured data', () => {
  test('the site declares its publisher and its search, once', async ({ page }) => {
    await page.goto('/');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const parsed = blocks.map((block) => JSON.parse(block) as Record<string, unknown>);

    const organisation = parsed.find((b) => b['@type'] === 'Organization');
    const website = parsed.find((b) => b['@type'] === 'WebSite');

    expect(organisation, 'Organization block missing').toBeTruthy();
    expect(website, 'WebSite block missing').toBeTruthy();
    expect(organisation?.name).toBe(SITE.name);

    // The search action must describe a search that genuinely works.
    const action = website?.potentialAction as { target?: { urlTemplate?: string } } | undefined;
    expect(action?.target?.urlTemplate).toContain('/classifieds?q=');
  });

  test('nothing invents a rating, opening hours or coordinates', async ({ page }) => {
    for (const path of ['/', '/contact', `/classifieds/${CATEGORIES[0]?.slug}`]) {
      await page.goto(path);
      const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
      const all = blocks.join(' ');
      for (const forbidden of [
        'aggregateRating',
        'ratingValue',
        'reviewCount',
        'openingHours',
        'priceRange',
        '"geo"',
      ]) {
        expect(all, `${path} emitted ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  test('the contact page describes the office with its real details', async ({ page }) => {
    await page.goto('/contact');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const business = blocks
      .map((b) => JSON.parse(b) as Record<string, unknown>)
      .find((b) => b['@type'] === 'LocalBusiness');

    expect(business).toBeTruthy();
    const address = business?.address as Record<string, string> | undefined;
    expect(address?.addressLocality).toBe(SITE.city);
    expect(address?.addressCountry).toBe('IN');
    // The telephone numbers must be the ones the site itself shows.
    expect(JSON.stringify(business?.telephone)).toContain(SITE.phones[0]);
  });

  test('a section lists its advertisements as an ItemList', async ({ page }) => {
    await page.goto('/classifieds/jobs');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const list = blocks
      .map((b) => JSON.parse(b) as Record<string, unknown>)
      .find((b) => b['@type'] === 'ItemList');

    expect(list).toBeTruthy();
    const items = list?.itemListElement as Array<{ url: string }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.url).toContain('/classifieds/');
  });

  test('breadcrumbs on a section match the trail shown', async ({ page }) => {
    await page.goto('/classifieds/jobs');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const crumbs = blocks
      .map((b) => JSON.parse(b) as Record<string, unknown>)
      .find((b) => b['@type'] === 'BreadcrumbList');

    expect(crumbs).toBeTruthy();
    const items = crumbs?.itemListElement as Array<{ name: string; position: number }>;
    expect(items.map((i) => i.name)).toEqual(['Home', 'Classifieds', 'Jobs & Recruitment']);

    // And the same trail is on the page, visible.
    const visible = await page.locator('nav[aria-label="Breadcrumb"] li').allInnerTexts();
    expect(visible.join(' ')).toContain('Jobs & Recruitment');
  });
});

test.describe('canonicals and indexing', () => {
  test('a filtered view is not indexed and points at its section', async ({ page }) => {
    await page.goto('/classifieds?q=flat');
    expect(await head(page, 'meta[name="robots"]')).toContain('noindex');
    const canonical = await head(page, 'link[rel="canonical"]', 'href');
    expect(new URL(canonical as string).pathname).toBe('/classifieds');
    expect(new URL(canonical as string).search).toBe('');
  });

  test('a sorted view is not indexed', async ({ page }) => {
    await page.goto('/classifieds/jobs?sort=price-asc');
    expect(await head(page, 'meta[name="robots"]')).toContain('noindex');
  });

  test('a later page is indexed and canonical to itself', async ({ page }) => {
    await page.goto('/classifieds?page=2');
    const robots = await head(page, 'meta[name="robots"]');
    expect(robots ?? '').not.toContain('noindex');
    const canonical = await head(page, 'link[rel="canonical"]', 'href');
    expect(new URL(canonical as string).search).toBe('?page=2');
  });

  test('private pages ask not to be indexed', async ({ page }) => {
    for (const path of ['/sign-in', '/sign-up', '/post-ad']) {
      await page.goto(path);
      expect(await head(page, 'meta[name="robots"]'), path).toContain('noindex');
    }
  });
});

test.describe('status codes', () => {
  test('a live section answers 200', async ({ request }) => {
    expect((await request.get('/classifieds/jobs')).status()).toBe(200);
  });

  test('an unknown place under a real section is a genuine 404', async ({ request }) => {
    const response = await request.get('/classifieds/jobs/atlantis');
    expect(response.status()).toBe(404);
    expect(response.headers()['x-robots-tag']).toContain('noindex');
  });

  test('an unknown section with a real place is a genuine 404', async ({ request }) => {
    expect((await request.get('/classifieds/nosuchsection/roorkee')).status()).toBe(404);
  });

  test('a path deeper than the site goes is a genuine 404', async ({ request }) => {
    expect((await request.get('/classifieds/jobs/roorkee/deeper')).status()).toBe(404);
  });

  test('the 404 offers a search and the sections', async ({ page }) => {
    await page.goto('/classifieds/jobs/atlantis');
    await expect(page.locator('form[role="search"] input[name="q"]')).toBeVisible();
    await expect(page.getByRole('link', { name: CATEGORIES[0]!.name })).toBeVisible();
  });

  test('the application 404 also offers a way onward', async ({ page }) => {
    const response = await page.goto('/no-such-page-at-all');
    expect(response?.status()).toBe(404);
    await expect(page.locator('form[role="search"] input[name="q"]')).toBeVisible();
  });
});

test.describe('robots and sitemaps', () => {
  test('robots.txt allows the site and names every sitemap', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();

    expect(body).toContain('Allow: /');
    for (const blocked of ['/admin/', '/my-ads/', '/api/', '/auth/']) {
      expect(body).toContain(`Disallow: ${blocked}`);
    }
    // The whole site must never be blocked.
    expect(body).not.toMatch(/^Disallow: \/$/m);
    expect(body).toContain('/sitemap.xml');
    expect(body).toContain('/classifieds/sitemap/0.xml');
  });

  test('the main sitemap holds the sections and no private page', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text();

    for (const category of CATEGORIES) {
      expect(body).toContain(`/classifieds/${category.slug}<`);
    }
    for (const forbidden of ['/admin', '/my-ads', '/sign-in', '/sign-up', '/post-ad', '/search']) {
      expect(body, `${forbidden} must not be in the sitemap`).not.toContain(`${forbidden}<`);
    }
  });

  test('the advertisement sitemap lists advertisements with real dates', async ({ request }) => {
    const body = await (await request.get('/classifieds/sitemap/0.xml')).text();
    expect(body).toContain('/classifieds/');
    expect(body).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}/);
  });

  test('every URL in the sitemap actually resolves', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text();
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] as string);
    expect(urls.length).toBeGreaterThan(5);

    for (const url of urls) {
      const path = new URL(url).pathname || '/';
      const response = await request.get(path);
      expect(response.status(), `${path} is in the sitemap`).toBe(200);
    }
  });
});

test.describe('the share card', () => {
  test('the generated Open Graph image is a real PNG', async ({ request }) => {
    const response = await request.get('/opengraph-image');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    expect((await response.body()).byteLength).toBeGreaterThan(1000);
  });

  test('a share card never carries an advertiser\'s telephone number', async ({ page }) => {
    await page.goto('/classifieds');
    const href = await firstAdvertisementHref(page);
    await page.goto(href);

    const shared = [
      await head(page, 'meta[property="og:title"]'),
      await head(page, 'meta[property="og:description"]'),
      await head(page, 'meta[name="description"]'),
      await page.title(),
    ].join(' ');

    // A social preview is forwarded by people who never opened the page.
    expect(shared).not.toMatch(/\b[6-9]\d{9}\b/);
  });
});

test.describe('advertisement pages', () => {
  test('an advertisement says what it is and where, and is indexable', async ({ page }) => {
    await page.goto('/classifieds');
    const href = await firstAdvertisementHref(page);
    await page.goto(href);

    const robots = await head(page, 'meta[name="robots"]');
    expect(robots ?? '').not.toContain('noindex');

    expect(await head(page, 'meta[property="og:type"]')).toBe('article');

    const canonical = await head(page, 'link[rel="canonical"]', 'href');
    expect(new URL(canonical as string).pathname).toBe(href);
  });

  test('every advertisement photograph has descriptive alternative text', async ({ page }) => {
    await page.goto('/classifieds');
    const alts = await page
      .locator('article img, li img')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLImageElement).alt));

    // Cover photographs are described; where a card has no photograph there is
    // no image element at all, so an empty list is not a failure.
    for (const alt of alts.filter(Boolean)) {
      expect(alt.length).toBeGreaterThan(5);
    }
  });
});
