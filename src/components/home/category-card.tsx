import Link from 'next/link';

import { CategoryIcon } from '@/components/ui/icons';
import { categoryHref, type Category } from '@/config/categories';

/**
 * One category. The whole card is a single link, so a grid of nine adds nine
 * tab stops rather than eighteen.
 */
export function CategoryCard({ category }: { category: Category }) {
  return (
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
    </Link>
  );
}
