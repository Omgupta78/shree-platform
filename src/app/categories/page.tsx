import type { Metadata } from 'next';

import { publicMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';

import { Container } from '@/components/ui/container';
import { CategoryIcon } from '@/components/ui/icons';
import { CATEGORIES, categoryHref } from '@/config/categories';
import { countByCategory } from '@/lib/data/classifieds-repository';

export const metadata: Metadata = publicMetadata({
  title: 'All categories',
  description:
    'Every classified section on Shree Classified — jobs, property, education, vehicles, business, services, matrimonial, buy and sell, and public notices across Roorkee and Haridwar district.',
  path: '/categories',
});

/**
 * The category index. Reads the same central configuration the browsing pages
 * use, with live counts from the repository.
 */
export default async function CategoriesPage() {
  const counts = await countByCategory();

  return (
    <Container className="py-12">
      <h1 className="font-serif text-3xl font-semibold sm:text-4xl">All categories</h1>
      <p className="mt-2 max-w-2xl text-[0.9375rem] text-fg-muted">
        The same sections that run in the printed edition each week.
      </p>

      <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((category) => {
          const count = counts[category.slug] ?? 0;
          return (
            <li key={category.slug}>
              <Link
                href={categoryHref(category.slug)}
                className="group flex h-full flex-col rounded-md border border-line bg-surface p-5 transition-colors hover:border-primary hover:bg-surface-sunken"
              >
                <span className="text-fg-subtle transition-colors group-hover:text-primary">
                  <CategoryIcon name={category.icon} size={26} />
                </span>
                <span className="mt-4 font-serif text-lg leading-tight font-semibold">
                  {category.name}
                </span>
                {category.printedAs ? (
                  <span lang="hi" className="font-deva mt-1 text-xs text-fg-subtle">
                    {category.printedAs}
                  </span>
                ) : null}
                <span className="mt-2 text-sm leading-relaxed text-fg-muted">
                  {category.description}
                </span>
                <span className="mt-4 text-xs text-fg-subtle tabular-nums">
                  {count} {count === 1 ? 'advertisement' : 'advertisements'}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Container>
  );
}
