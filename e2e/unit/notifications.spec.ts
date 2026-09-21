import { expect, test } from '@playwright/test';

import {
  actionFor,
  escapeHtml,
  renderEmail,
  subjectFor,
  whatsAppParameters,
} from '../../src/lib/notifications/templates';
import { normaliseIndianNumber } from '../../src/lib/notifications/recipients';
import type { NotificationType } from '../../src/types/database';

/**
 * The message templates, as pure functions. No provider, no account, no
 * network — these run in Node against strings.
 *
 * Two of these tests are the ones worth having. An advertiser's name goes
 * into HTML that is sent to them, and a name is whatever somebody typed; and
 * a payment notification must never claim the advertisement is published,
 * which is the single wording mistake Phases 9 and 10 both warn about by name.
 */

const ALL_TYPES: NotificationType[] = [
  'advertisement_submitted',
  'advertisement_approved',
  'advertisement_rejected',
  'advertisement_changes_requested',
  'advertisement_expiring',
  'advertisement_expired',
  'renewal_submitted',
  'renewal_approved',
  'renewal_rejected',
  'payment_successful',
  'payment_failed',
  'payment_cancelled',
  'staff_advertisement_submitted',
  'staff_renewal_submitted',
  'staff_payment_received',
  'staff_report_received',
];

const ORIGIN = 'https://shree.example';

function message(overrides: Partial<Parameters<typeof renderEmail>[1]> = {}) {
  return {
    title: 'Your advertisement is published',
    body: 'SC100018 is now on the site and runs until 21 Oct 2026.',
    recipientName: 'Asha Verma',
    href: '/my-ads/abc',
    ...overrides,
  };
}

test.describe('every type has a message', () => {
  test('a subject, and no duplicates', () => {
    const subjects = ALL_TYPES.map(subjectFor);
    for (const subject of subjects) {
      expect(subject.length).toBeGreaterThan(8);
    }
    expect(new Set(subjects).size).toBe(subjects.length);
  });

  test('every type renders without throwing', () => {
    for (const type of ALL_TYPES) {
      const email = renderEmail(type, message(), ORIGIN);
      expect(email.subject).toBe(subjectFor(type));
      expect(email.html).toContain('<!doctype html>');
      expect(email.text.length).toBeGreaterThan(20);
    }
  });

  test('the office and the advertiser are addressed differently', () => {
    expect(subjectFor('staff_advertisement_submitted')).toContain('[');
    expect(subjectFor('advertisement_approved')).not.toContain('[');
  });
});

test.describe('escaping', () => {
  test('the five characters that matter', () => {
    expect(escapeHtml(`<&">'`)).toBe('&lt;&amp;&quot;&gt;&#39;');
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml(`"quoted"`)).toBe('&quot;quoted&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  test("a name is escaped before it reaches the email", () => {
    // A name is whatever somebody typed into the submission form.
    const email = renderEmail(
      'advertisement_approved',
      message({ recipientName: '<img src=x onerror=alert(1)>' }),
      ORIGIN,
    );
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain('&lt;img src=x');
  });

  test('a body is escaped too', () => {
    const email = renderEmail(
      'advertisement_rejected',
      message({ body: 'Refused: <b>see</b> "the note"' }),
      ORIGIN,
    );
    expect(email.html).not.toContain('<b>see</b>');
    expect(email.html).toContain('&lt;b&gt;see&lt;/b&gt;');
  });
});

test.describe('links', () => {
  test('a relative href becomes an absolute URL', () => {
    const email = renderEmail('advertisement_approved', message({ href: '/my-ads/abc' }), ORIGIN);
    expect(email.html).toContain(`${ORIGIN}/my-ads/abc`);
    expect(email.text).toContain(`${ORIGIN}/my-ads/abc`);
  });

  test('no href means no button, and no empty link', () => {
    const email = renderEmail('advertisement_approved', message({ href: null }), ORIGIN);
    expect(email.html).not.toContain('<a href');
    expect(email.text).not.toContain('http');
  });

  test('a changes-requested message points at editing', () => {
    expect(actionFor('advertisement_changes_requested')).toBe('Edit your advertisement');
    expect(actionFor('advertisement_expiring')).toBe('Renew your advertisement');
  });
});

test.describe('wording that must not drift', () => {
  test('a successful payment never claims the advertisement is published', () => {
    // The database writes this body; the email carries it unchanged. Both
    // halves are asserted — here, and in supabase/test/notification_checks.sql.
    const email = renderEmail(
      'payment_successful',
      message({
        title: 'Payment received',
        body: 'We have received ₹199.00 for SC100018. Your advertisement is now awaiting review.',
      }),
      ORIGIN,
    );

    expect(email.html).toContain('awaiting review');
    expect(email.html.toLowerCase()).not.toContain('is now live');
    expect(email.html.toLowerCase()).not.toContain('is published');
  });

  test('the footer says this is not a newsletter', () => {
    const email = renderEmail('advertisement_approved', message(), ORIGIN);
    expect(email.html).toContain('not a newsletter');
  });

  test('an empty name is still addressed politely', () => {
    const email = renderEmail('advertisement_approved', message({ recipientName: '   ' }), ORIGIN);
    expect(email.text).toContain('Hello there,');
  });
});

test.describe('whatsapp parameters', () => {
  test('are flattened, because Meta refuses newlines and tabs', () => {
    const params = whatsAppParameters(
      message({ body: 'Line one.\nLine two.\t\tIndented.    Spaced.' }),
      ORIGIN,
    );
    for (const param of params) {
      expect(param).not.toMatch(/[\n\t]/);
      expect(param).not.toMatch(/ {4}/);
    }
  });

  test('carry the name, the message and a link', () => {
    const params = whatsAppParameters(message(), ORIGIN);
    expect(params).toHaveLength(3);
    expect(params[0]).toBe('Asha Verma');
    expect(params[2]).toBe(`${ORIGIN}/my-ads/abc`);
  });

  test('fall back to the dashboard when there is no link', () => {
    const params = whatsAppParameters(message({ href: null }), ORIGIN);
    expect(params[2]).toBe(`${ORIGIN}/my-ads`);
  });
});

test.describe('telephone numbers', () => {
  test('ten local digits gain the country code', () => {
    expect(normaliseIndianNumber('9719419913')).toBe('919719419913');
  });

  test('punctuation and spacing are ignored', () => {
    expect(normaliseIndianNumber('+91 97194 19913')).toBe('919719419913');
    expect(normaliseIndianNumber('097194-19913')).toBe(null); // eleven digits: not a number we know
  });

  test('a number already carrying the country code is left alone', () => {
    expect(normaliseIndianNumber('919719419913')).toBe('919719419913');
  });

  test('anything else is refused rather than guessed at', () => {
    expect(normaliseIndianNumber('')).toBe(null);
    expect(normaliseIndianNumber('12345')).toBe(null);
    expect(normaliseIndianNumber('not a number')).toBe(null);
  });
});
