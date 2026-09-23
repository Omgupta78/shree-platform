import { expect, test } from '@playwright/test';

import { parseAdQuery } from '../../src/lib/classifieds/query';
import { hasExplicitSort, hasNarrowingFilter, listingIndexing } from '../../src/lib/seo/listing';
import { metaDescription } from '../../src/lib/seo/metadata';

/**
 * The SEO decisions that are arithmetic rather than opinion.
 *
 * Which listing URLs ask to be indexed, where each one's canonical points, and
 * how prose is cut for a search result. All pure, so they run in Node without
 * a database or a browser.
 *
 * What is NOT here is whether a page actually emits the tags — that is checked
 * against a real running server in `e2e/seo.spec.ts`, because a builder that
 * returns the right object and a page that forgets to use it look identical
 * from inside a unit test.
 */

const RAW = (params: Record<string, string> = {}) => params;

test.describe('which listing views ask to be indexed', () => {
  test('a bare section is the canonical page', () => {
    const query = parseAdQuery(RAW(), 'jobs');
    const result = listingIndexing('/classifieds/jobs', query, RAW());
    expect(result.index).toBe(true);
    expect(result.canonicalPath).toBe('/classifieds/jobs');
  });

  test('a search term is not a page of its own', () => {
    const query = parseAdQuery(RAW({ q: 'iphone' }), null);
    const result = listingIndexing('/classifieds', query, RAW({ q: 'iphone' }));
    expect(result.index).toBe(false);
    // It points back at the section it is a view of, so whatever value the
    // URL has accrues to a page that should rank.
    expect(result.canonicalPath).toBe('/classifieds');
  });

  test('a sort order is not a page of its own, even the default one', () => {
    // `?sort=newest` renders exactly what `/classifieds` renders. Two URLs,
    // one page — which is the definition of duplicate content.
    const raw = RAW({ sort: 'newest' });
    const result = listingIndexing('/classifieds', parseAdQuery(raw, null), raw);
    expect(result.index).toBe(false);
    expect(result.canonicalPath).toBe('/classifieds');
  });

  test('each filter on its own is enough to stop indexing', () => {
    for (const raw of [
      RAW({ location: 'roorkee' }),
      RAW({ minPrice: '1000' }),
      RAW({ maxPrice: '5000' }),
      RAW({ posted: '7' }),
      RAW({ type: 'featured' }),
    ]) {
      const result = listingIndexing('/classifieds', parseAdQuery(raw, null), raw);
      expect(result.index, JSON.stringify(raw)).toBe(false);
    }
  });

  test('a later page IS indexed, and is canonical to itself', () => {
    // Page two holds different advertisements from page one. Pointing its
    // canonical at page one would claim they are the same page.
    const raw = RAW({ page: '3' });
    const result = listingIndexing('/classifieds/jobs', parseAdQuery(raw, 'jobs'), raw);
    expect(result.index).toBe(true);
    expect(result.canonicalPath).toBe('/classifieds/jobs?page=3');
  });

  test('a filter beats pagination: page four of a search is still not indexed', () => {
    const raw = RAW({ q: 'flat', page: '4' });
    const result = listingIndexing('/classifieds', parseAdQuery(raw, null), raw);
    expect(result.index).toBe(false);
    expect(result.canonicalPath).toBe('/classifieds');
  });

  test('a location landing page canonicalises to itself, not to the section', () => {
    const query = parseAdQuery(RAW({ location: 'roorkee' }), 'jobs');
    const result = listingIndexing('/classifieds/jobs/roorkee', query, RAW());
    expect(result.canonicalPath).toBe('/classifieds/jobs/roorkee');
  });
});

test.describe('reading the raw parameters', () => {
  test('an explicit sort is visible in the raw URL but not in the parsed query', () => {
    // `parseAdQuery` fills the default in, so by then "newest" and "nothing
    // given" are indistinguishable. This is why the raw params are consulted.
    expect(parseAdQuery(RAW(), null).sort).toBe(parseAdQuery(RAW({ sort: 'newest' }), null).sort);
    expect(hasExplicitSort(RAW())).toBe(false);
    expect(hasExplicitSort(RAW({ sort: 'newest' }))).toBe(true);
  });

  test('a page number alone is not a narrowing filter', () => {
    expect(hasNarrowingFilter(parseAdQuery(RAW({ page: '2' }), null))).toBe(false);
  });

  test('a blank search term is not a filter', () => {
    expect(hasNarrowingFilter(parseAdQuery(RAW({ q: '   ' }), null))).toBe(false);
  });
});

test.describe('cutting prose for a search result', () => {
  test('short text is left exactly as written', () => {
    expect(metaDescription('Two bedroom flat in Roorkee.')).toBe('Two bedroom flat in Roorkee.');
  });

  test('long text is cut at a word, not mid-word', () => {
    const text = `${'word '.repeat(60)}end`;
    const cut = metaDescription(text);
    expect(cut.length).toBeLessThanOrEqual(161);
    expect(cut.endsWith('…')).toBe(true);
    // The character before the ellipsis is the end of a word, never a space
    // and never half of one.
    expect(cut.slice(-2, -1)).not.toBe(' ');
  });

  test('runs of whitespace and newlines are collapsed', () => {
    expect(metaDescription('Flat   in\n\n  Roorkee')).toBe('Flat in Roorkee');
  });

  test('trailing punctuation is not left dangling before the ellipsis', () => {
    const cut = metaDescription(`${'a'.repeat(150)}, and then some more words here`, 160);
    expect(cut).not.toContain(',…');
  });
});
