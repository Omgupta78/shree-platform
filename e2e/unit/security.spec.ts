import { expect, test } from '@playwright/test';

import { serialiseJsonLd } from '../../src/lib/seo/jsonld';

/**
 * The escaping that stands between an advertiser's typing and a script block.
 *
 * This suite exists because of a real defect found in the Phase 13 audit:
 * two JSON-LD emitters wrote `JSON.stringify(...)` straight into a
 * `<script>` element. `JSON.stringify` escapes quotes and backslashes and
 * nothing else, so an advertisement titled
 *
 *   Flat for rent </script><script>…</script>
 *
 * ended the script element early and had the rest parsed as HTML — stored
 * cross-site scripting, on the public advertisement page, reachable by anyone
 * who could submit an advertisement. Titles deliberately allow `<`, because
 * it is a legitimate character to type, so the fix belongs at output.
 */

test.describe('JSON-LD serialisation', () => {
  test('a closing script tag in user text cannot end the block', () => {
    const output = serialiseJsonLd({
      name: 'Flat for rent </script><script>alert(1)</script>',
    });

    // The literal characters must not survive anywhere in the output.
    expect(output).not.toContain('</script>');
    expect(output).not.toContain('<');
    expect(output).not.toContain('>');
    expect(output).toContain('\\u003c');
  });

  test('ampersands are escaped too', () => {
    expect(serialiseJsonLd({ name: 'Tools & Hardware' })).not.toContain('&');
  });

  test('the line separators that break JavaScript strings are escaped', () => {
    // Valid inside JSON, but line terminators in JavaScript source: an
    // unescaped one turns the block into a syntax error.
    const output = serialiseJsonLd({ name: 'a b c' });
    expect(output).not.toContain(' ');
    expect(output).not.toContain(' ');
    expect(output).toContain('\\u2028');
    expect(output).toContain('\\u2029');
  });

  test('what comes out is still the same data', () => {
    // Escaping must not change meaning: these are JSON \\u escapes, so parsing
    // the output has to give back exactly what went in.
    const original = {
      name: 'Flat </script> & "quoted"   line',
      nested: { list: ['a<b', 'c>d'] },
      count: 42,
    };
    expect(JSON.parse(serialiseJsonLd(original))).toEqual(original);
  });

  test('ordinary text is unharmed', () => {
    const data = { name: '2 BHK flat for rent in Roorkee', price: 12000 };
    expect(JSON.parse(serialiseJsonLd(data))).toEqual(data);
  });
});
