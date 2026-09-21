import Link from 'next/link';

import { CategoryIcon } from '@/components/ui/icons';
import { CATEGORIES, categoryHref, type Category } from '@/config/categories';
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
}: {
  /** Null on the all-classifieds page. */
  category: Category | null;
  totalLabel: string;
}) {
  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-0 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="text-xs text-fg-subtle">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-primary">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              {category ? (
                <Link href="/classifieds" className="hover:text-primary">
                  Classifieds
                </Link>
              ) : (
                <span className="text-fg">Classifieds</span>
              )}
            </li>
            {category ? (
              <>
                <li aria-hidden="true">/</li>
                <li className="text-fg">{category.name}</li>
              </>
            ) : null}
          </ol>
        </nav>

        <div className="mt-4 flex items-start gap-4">
          {category ? (
            <span className="mt-1 hidden text-primary sm:block">
              <CategoryIcon name={category.icon} size={30} />
            </span>
          ) : null}

          <div className="min-w-0">
            <h1 className="font-serif text-3xl leading-tight font-semibold sm:text-4xl">
              {category ? category.name : 'Classifieds'}
            </h1>
            {category?.printedAs ? (
              <p lang="hi" className="font-deva mt-1 text-sm text-fg-subtle">
                {category.printedAs}
              </p>
            ) : null}
            <p className="mt-2 max-w-2xl text-[0.9375rem] text-fg-muted">
              {category
                ? category.description
                : 'Browse local advertisements from Shree Classified.'}
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
