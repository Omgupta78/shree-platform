import Link from 'next/link';

import { serialiseJsonLd } from '@/lib/seo/jsonld';

export interface Crumb {
  label: string;
  /** Omitted on the final crumb, which is the current page. */
  href?: string;
}

/**
 * Breadcrumb trail.
 *
 * Emits BreadcrumbList structured data alongside the visible markup, so the
 * trail Google shows under a result matches the one on the page.
 */
export function Breadcrumbs({ items, baseUrl }: { items: Crumb[]; baseUrl?: string }) {
  const jsonLd = baseUrl
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.label,
          ...(item.href ? { item: `${baseUrl}${item.href}` } : {}),
        })),
      }
    : null;

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-xs text-fg-subtle">
        <ol className="flex flex-wrap items-center gap-1.5">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {item.href ? (
                <Link href={item.href} className="hover:text-primary">
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="max-w-[18rem] truncate text-fg">
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serialiseJsonLd(jsonLd) }}
        />
      ) : null}
    </>
  );
}
