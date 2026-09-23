import { CATEGORIES } from '@/config/categories';
import { SITE } from '@/config/site';
import { siteUrl } from '@/lib/env';
import type { OfficeDetails } from '@/lib/data/settings';

/**
 * Structured data, built only from facts this project actually holds.
 *
 * The rule here is stricter than the schema.org vocabulary. Schema.org will
 * happily accept an `aggregateRating`, an `openingHours`, a `geo` or a
 * `priceRange`; this office has none of those written down anywhere, so none
 * of them is emitted. Marking up a rating nobody gave, or opening hours nobody
 * recorded, is a lie told in a machine-readable format — and one that search
 * engines penalise when they find it out.
 *
 * Every helper below takes real values and leaves out what it was not given.
 * Nothing has a default that invents a fact.
 */

/**
 * Serialises a JSON-LD payload for safe embedding in a `<script>` element.
 *
 * `JSON.stringify` escapes quotes and backslashes. It does NOT escape `<`, `>`
 * or `&` — so a value containing the characters `</script>` ends the script
 * element early and everything after it is parsed as HTML. Every one of these
 * payloads carries text an advertiser typed: a title, a description, a
 * breadcrumb. An advertisement titled
 *
 *   Flat for rent </script><script>…</script>
 *
 * would therefore have run whatever followed, on the public page, for every
 * visitor. Titles are not restricted to a character set, and should not be —
 * `<` is a legitimate thing to type. The escaping belongs at the point of
 * output, which is here.
 *
 * U+2028 and U+2029 are escaped as well. They are valid inside a JSON string
 * but are line terminators in JavaScript source, so an unescaped one turns the
 * block into a syntax error.
 */
export function serialiseJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

/** Renders one JSON-LD block. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialiseJsonLd(data) }}
    />
  );
}

/* --------------------------------------------------------- the business -- */

/**
 * Who publishes this site.
 *
 * `telephone`, `email` and `address` are the ones printed on the paper and
 * kept in `app_settings`, so an office that changes its number changes this
 * too. `sameAs` is omitted entirely: it is for verified social profiles, and
 * this project holds none.
 */
export function organisationSchema(office: OfficeDetails): Record<string, unknown> {
  const base = siteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${base}/#organisation`,
    name: SITE.name,
    legalName: office.legalName,
    url: base,
    description: SITE.description,
    email: office.email,
    telephone: office.phones.map((phone) => `+91${phone}`),
    address: postalAddress(office),
    areaServed: {
      '@type': 'AdministrativeArea',
      name: `${SITE.city} and Haridwar district`,
    },
  };
}

/**
 * The office as a place of business, for the contact page.
 *
 * `LocalBusiness` rather than a narrower type, because "advertising agency and
 * classified publisher" has no exact schema.org subtype and picking a wrong
 * one is worse than picking the general one.
 *
 * No `geo`, no `openingHoursSpecification`, no `priceRange`. Those are the
 * three fields every guide tells you to add, and this project does not know
 * any of them. A coordinate pair guessed from a street name puts a pin on
 * somebody else's shop.
 */
export function localBusinessSchema(office: OfficeDetails): Record<string, unknown> {
  const base = siteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${base}/#office`,
    name: office.legalName,
    alternateName: SITE.name,
    url: `${base}/contact`,
    email: office.email,
    telephone: office.phones.map((phone) => `+91${phone}`),
    address: postalAddress(office),
    parentOrganization: { '@id': `${base}/#organisation` },
  };
}

function postalAddress(office: OfficeDetails): Record<string, unknown> {
  return {
    '@type': 'PostalAddress',
    // The office's address is one printed line rather than separated fields,
    // so it goes in as one line. Splitting it on commas to fill
    // `streetAddress` and `addressLocality` would be guessing where the
    // street stops.
    streetAddress: office.address,
    addressLocality: SITE.city,
    addressRegion: SITE.state,
    addressCountry: 'IN',
  };
}

/* ------------------------------------------------------------- the site -- */

/**
 * The site itself, with its search.
 *
 * `SearchAction` is included because the search it describes genuinely works:
 * `/classifieds?q=` is a real, crawlable, server-rendered query, not a
 * JavaScript-only box. Declaring a search action a site does not truly support
 * is invalid markup, so this one is tied to the URL the browse page actually
 * reads.
 */
export function websiteSchema(): Record<string, unknown> {
  const base = siteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    name: SITE.name,
    url: base,
    description: SITE.description,
    inLanguage: 'en-IN',
    publisher: { '@id': `${base}/#organisation` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${base}/classifieds?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/* ------------------------------------------------------------ the lists -- */

/**
 * The advertisements on a listing page, as an ordered list of links.
 *
 * Only the position and the URL. No price, no image, no availability: this is
 * a table of contents, and repeating each advertisement's details here would
 * mean maintaining the same facts in two places, where they can disagree.
 */
export function itemListSchema({
  name,
  path,
  urls,
}: {
  name: string;
  path: string;
  urls: readonly string[];
}): Record<string, unknown> {
  const base = siteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url: `${base}${path}`,
    numberOfItems: urls.length,
    itemListElement: urls.map((url, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: url.startsWith('http') ? url : `${base}${url}`,
    })),
  };
}

/** The category index, for the site's own navigation. */
export function categoryListSchema(): Record<string, unknown> {
  return itemListSchema({
    name: `Classified sections on ${SITE.name}`,
    path: '/categories',
    urls: CATEGORIES.map((category) => `/classifieds/${category.slug}`),
  });
}
