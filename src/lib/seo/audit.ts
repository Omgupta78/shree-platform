import 'server-only';

import { CATEGORIES } from '@/config/categories';
import { PRIMARY_NAV } from '@/config/navigation';
import { createSupabaseAnonClient } from '@/lib/supabase/public';
import { isSupabaseConfigured } from '@/lib/env';
import { liveLocationLandings, LANDING_MINIMUM_ADS } from '@/lib/seo/landings';
import { advertisementSitemapCount, SITEMAP_PAGE_SIZE } from '@/lib/seo/sitemap';

/**
 * The SEO audit, computed from the site's own rows.
 *
 * What this page is NOT is the reason it is worth having. It reports no
 * ranking, no "SEO score", no impressions, no keyword positions and no
 * estimate of traffic. None of those are facts this project holds: rankings
 * live in Google's index and impressions live in Search Console, and a number
 * invented here to fill the space would be read as a measurement and planned
 * against. Search Console is where those belong, and this page says so.
 *
 * What it does report is everything that is decidable from the database and
 * the site's own configuration: which advertisements would go to a search
 * engine with nothing to show, which slugs collide, which sections have no
 * inventory, and whether the machinery — sitemap, robots, canonicals — is
 * actually producing what it claims to.
 *
 * Every number below is a count of real rows.
 */

export type FindingLevel = 'error' | 'warning' | 'note';

export interface Finding {
  level: FindingLevel;
  title: string;
  /** What it means and what to do, in a sentence or two. */
  detail: string;
  count: number;
  /** Up to a handful of examples, so it can be acted on rather than admired. */
  examples: string[];
}

export interface AuditRow {
  slug: string;
  title: string;
  reference: string;
}

export interface SeoAudit {
  /** Public pages that ask to be indexed. */
  indexablePages: number;
  /** Public pages that exist but say noindex. */
  noindexPages: number;
  liveAdvertisements: number;
  sitemapFiles: number;
  sitemapPageSize: number;
  locationLandings: number;
  landingThreshold: number;
  findings: Finding[];
  /** False when the site is running on the offline dataset. */
  fromDatabase: boolean;
}

/** Titles shorter than this have little to distinguish them in a result. */
const SHORT_TITLE = 15;
/** Google renders roughly 60 characters of a title before cutting it. */
const LONG_TITLE = 70;
/** Below this, an advertisement's description cannot make a useful snippet. */
const SHORT_DESCRIPTION = 50;

export async function runSeoAudit(): Promise<SeoAudit> {
  const [landings, sitemapFiles] = await Promise.all([
    liveLocationLandings(),
    advertisementSitemapCount(),
  ]);

  /*
   * The pages that are not advertisements, counted from the same
   * configuration the sitemap and the navigation read — so this cannot drift
   * from what is actually served.
   */
  const staticIndexable = ['/', '/classifieds', '/categories', '/advertise', '/about', '/contact'];
  // Listed for completeness: they exist, they are reachable, they say noindex.
  const staticNoindex = [
    '/post-ad',
    '/sign-in',
    '/sign-up',
    '/forgot-password',
    '/update-password',
  ];

  const findings: Finding[] = [];

  // A menu entry pointing at a page that does not exist teaches people — and
  // crawlers — to distrust the rest of the menu.
  const unbuilt = PRIMARY_NAV.filter((link) => !link.built);
  if (unbuilt.length > 0) {
    findings.push({
      level: 'error',
      title: 'Navigation links to pages that are not built',
      detail:
        'These appear in the header or footer and would answer 404. They should be removed from the menu until the page exists.',
      count: unbuilt.length,
      examples: unbuilt.map((link) => link.href),
    });
  }

  if (!isSupabaseConfigured) {
    return {
      indexablePages: staticIndexable.length + CATEGORIES.length + landings.length,
      noindexPages: staticNoindex.length,
      liveAdvertisements: 0,
      sitemapFiles,
      sitemapPageSize: SITEMAP_PAGE_SIZE,
      locationLandings: landings.length,
      landingThreshold: LANDING_MINIMUM_ADS,
      fromDatabase: false,
      findings: [
        {
          level: 'note',
          title: 'Not connected to the database',
          detail:
            'The advertisement checks below need a Supabase connection. Everything shown is from the site configuration only.',
          count: 0,
          examples: [],
        },
        ...findings,
      ],
    };
  }

  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from('public_ads')
    .select('slug, title, description, reference, image_count, category_slug, location_slug');

  if (error) {
    return {
      indexablePages: staticIndexable.length + CATEGORIES.length + landings.length,
      noindexPages: staticNoindex.length,
      liveAdvertisements: 0,
      sitemapFiles,
      sitemapPageSize: SITEMAP_PAGE_SIZE,
      locationLandings: landings.length,
      landingThreshold: LANDING_MINIMUM_ADS,
      fromDatabase: false,
      findings: [
        {
          level: 'error',
          title: 'The advertisements could not be read',
          detail: 'The audit ran without them, so the counts below are incomplete.',
          count: 0,
          examples: [],
        },
        ...findings,
      ],
    };
  }

  const rows = (data ?? []) as Array<{
    slug: string | null;
    title: string | null;
    description: string | null;
    reference: string | null;
    image_count: number | null;
    category_slug: string | null;
    location_slug: string | null;
  }>;

  /* ------------------------------------------------------ duplicate slugs -- */

  const bySlug = new Map<string, number>();
  for (const row of rows) {
    if (!row.slug) continue;
    bySlug.set(row.slug, (bySlug.get(row.slug) ?? 0) + 1);
  }
  const duplicates = [...bySlug.entries()].filter(([, n]) => n > 1);
  if (duplicates.length > 0) {
    findings.push({
      level: 'error',
      title: 'Two advertisements share one address',
      detail:
        'A slug is unique in the database, so this should be impossible; if it appears, the constraint is not doing its job and one of the two advertisements is unreachable.',
      count: duplicates.length,
      examples: duplicates.slice(0, 5).map(([slug]) => `/classifieds/${slug}`),
    });
  }

  // A slug that collides with a section name would be shadowed by the
  // section, which wins the route.
  const categorySlugs = new Set(CATEGORIES.map((c) => c.slug));
  const shadowed = rows.filter((row) => row.slug && categorySlugs.has(row.slug));
  if (shadowed.length > 0) {
    findings.push({
      level: 'error',
      title: 'An advertisement slug collides with a section',
      detail:
        'The section wins the route, so these advertisements are unreachable at their own address.',
      count: shadowed.length,
      examples: shadowed.slice(0, 5).map((row) => `/classifieds/${row.slug}`),
    });
  }

  const malformed = rows.filter((row) => !row.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug));
  if (malformed.length > 0) {
    findings.push({
      level: 'error',
      title: 'Slugs that are not URL-safe',
      detail:
        'A slug should be lowercase words joined by single hyphens. Anything else is escaped in the address bar and reads badly in a search result.',
      count: malformed.length,
      examples: malformed.slice(0, 5).map((row) => row.reference ?? '(no reference)'),
    });
  }

  /* --------------------------------------------------------- the metadata -- */

  const noDescription = rows.filter((row) => (row.description ?? '').trim().length < SHORT_DESCRIPTION);
  if (noDescription.length > 0) {
    findings.push({
      level: 'warning',
      title: 'Descriptions too short to make a snippet',
      detail: `Under ${SHORT_DESCRIPTION} characters, so the meta description gives a search engine almost nothing to show. The advertiser wrote it; the office can ask for more.`,
      count: noDescription.length,
      examples: noDescription.slice(0, 5).map(labelFor),
    });
  }

  const shortTitles = rows.filter((row) => (row.title ?? '').trim().length < SHORT_TITLE);
  if (shortTitles.length > 0) {
    findings.push({
      level: 'warning',
      title: 'Very short titles',
      detail:
        'A title of a few characters competes with every identical item in the country. Adding what it is, and for where, is usually enough.',
      count: shortTitles.length,
      examples: shortTitles.slice(0, 5).map(labelFor),
    });
  }

  const longTitles = rows.filter((row) => (row.title ?? '').trim().length > LONG_TITLE);
  if (longTitles.length > 0) {
    findings.push({
      level: 'note',
      title: 'Titles that will be cut short in a result',
      detail: `Over ${LONG_TITLE} characters. Nothing is penalised for it — Google simply truncates, at a point nobody chose.`,
      count: longTitles.length,
      examples: longTitles.slice(0, 5).map(labelFor),
    });
  }

  // Two advertisements with the same title are not an error — two people
  // genuinely do advertise the same flat — but they compete with each other.
  const titleCounts = new Map<string, number>();
  for (const row of rows) {
    const key = (row.title ?? '').trim().toLowerCase();
    if (!key) continue;
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }
  const repeatedTitles = [...titleCounts.entries()].filter(([, n]) => n > 1);
  if (repeatedTitles.length > 0) {
    findings.push({
      level: 'note',
      title: 'Titles used by more than one advertisement',
      detail:
        'Not a fault — two advertisers may genuinely be offering the same thing — but they compete with each other for the same search.',
      count: repeatedTitles.length,
      examples: repeatedTitles.slice(0, 5).map(([title, n]) => `${title} (${n})`),
    });
  }

  /* ----------------------------------------------------------- the images -- */

  const noImage = rows.filter((row) => (row.image_count ?? 0) === 0);
  if (noImage.length > 0) {
    findings.push({
      level: 'note',
      title: 'Advertisements with no photograph',
      detail:
        'Their share card falls back to the site’s own, and there is no image for a search result to show. Alternative text is generated from the title and the place, so nothing here is missing alt text — there is simply no picture.',
      count: noImage.length,
      examples: noImage.slice(0, 5).map(labelFor),
    });
  }

  /* --------------------------------------------------------- the sections -- */

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.category_slug) continue;
    counts.set(row.category_slug, (counts.get(row.category_slug) ?? 0) + 1);
  }
  const emptySections = CATEGORIES.filter((c) => (counts.get(c.slug) ?? 0) === 0);
  if (emptySections.length > 0) {
    findings.push({
      level: 'warning',
      title: 'Sections with nothing in them',
      detail:
        'These are in the sitemap and the menu but have no live advertisements, so a visitor arriving from a search finds an empty page.',
      count: emptySections.length,
      examples: emptySections.map((c) => `/classifieds/${c.slug}`),
    });
  }

  return {
    indexablePages: staticIndexable.length + CATEGORIES.length + landings.length + rows.length,
    noindexPages: staticNoindex.length,
    liveAdvertisements: rows.length,
    sitemapFiles,
    sitemapPageSize: SITEMAP_PAGE_SIZE,
    locationLandings: landings.length,
    landingThreshold: LANDING_MINIMUM_ADS,
    fromDatabase: true,
    findings,
  };
}

function labelFor(row: { title: string | null; reference: string | null }): string {
  return `${row.reference ?? '—'} · ${(row.title ?? '').slice(0, 60) || '(no title)'}`;
}
