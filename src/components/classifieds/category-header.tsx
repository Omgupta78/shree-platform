import Link from 'next/link';

import { Breadcrumbs, type Crumb } from '@/components/ui/breadcrumbs';
import { CategoryIcon } from '@/components/ui/icons';
import { CATEGORIES, categoryHref, type Category } from '@/config/categories';
import type { LocationOption } from '@/config/locations';
import { cn } from '@/lib/utils';

/**
 * Page heading for the browsing pages, plus the category rail beneath it.
 *
 * The rail matters more on mobile than a dropdown would: moving between
 * sections is the most common thing a reader does, and a horizontal scroller
 * keeps every section one tap away.
 */
export function CategoryHeader({
  category,
  totalLabel,
  place = null,
  intro,
  baseUrl,
}: {
  /** Null on the all-classifieds page. */
  category: Category | null;
  totalLabel: string;
  /** Set on a location landing page — "Jobs in Roorkee". */
  place?: LocationOption | null;
  /** Replaces the category's own one-liner where a landing page needs its own. */
  intro?: string;
  /** Absolute site URL. Given, the trail also emits BreadcrumbList data. */
  baseUrl?: string;
}) {
  const crumbs: Crumb[] = [
    { label: 'Home', href: '/' },
    { label: 'Classifieds', ...(category ? { href: '/classifieds' } : {}) },
  ];
  if (category) {
    crumbs.push({
      label: category.name,
      // The category is a link only when it is not itself the current page.
      ...(place ? { href: categoryHref(category.slug) } : {}),
    });
  }
  if (place) crumbs.push({ label: place.name });

  const heading = category
    ? place
      ? `${category.name} in ${place.name}`
      : category.name
    : 'Classifieds';

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-0 sm:px-6 lg:px-8">
        <Breadcrumbs items={crumbs} baseUrl={baseUrl} />

        <div className="mt-4 flex items-start gap-4">
          {category ? (
            <span className="mt-1 hidden text-primary sm:block">
              <CategoryIcon name={category.icon} size={30} />
            </span>
          ) : null}

          <div className="min-w-0">
            <h1 className="font-serif text-3xl leading-tight font-semibold sm:text-4xl">
              {heading}
            </h1>
            {category?.printedAs && !place ? (
              <p lang="hi" className="font-deva mt-1 text-sm text-fg-subtle">
                {category.printedAs}
              </p>
            ) : null}
            <p className="mt-2 max-w-2xl text-[0.9375rem] text-fg-muted">
              {intro ??
                (category
                  ? category.description
                  : 'Browse local advertisements from Shree Classified.')}
            </p>
            <p className="mt-1 text-sm text-fg-subtle">{totalLabel}</p>
          </div>
        </div>

        {/* Category rail */}
        <nav aria-label="Categories" className="mt-6 -mb-px overflow-x-auto">
          <ul className="flex min-w-max items-center gap-1">
            <RailLink href="/classifieds" active={!category}>
              All
            </RailLink>
            {CATEGORIES.map((item) => (
              <RailLink
                key={item.slug}
                href={categoryHref(item.slug)}
                active={category?.slug === item.slug}
              >
                {item.name}
              </RailLink>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function RailLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'inline-flex h-11 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors',
          active
            ? 'border-primary font-semibold text-primary'
            : 'border-transparent text-fg-muted hover:text-fg',
        )}
      >
        {children}
      </Link>
    </li>
  );
}
