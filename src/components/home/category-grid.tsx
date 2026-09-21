import { CategoryCard } from '@/components/home/category-card';
import { Section, SectionHeading } from '@/components/ui/section';
import { CATEGORIES } from '@/config/categories';

/**
 * Categories come from the central configuration, never from a list written
 * into this component.
 */
export function CategoryGrid() {
  return (
    <Section labelledBy="categories-heading">
      <SectionHeading
        id="categories-heading"
        eyebrow="Browse"
        title="Advertisement categories"
        description="The same sections that run in the printed edition each week."
        action={{ href: '/categories', label: 'All categories' }}
      />

      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((category) => (
          <li key={category.slug}>
            <CategoryCard category={category} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
