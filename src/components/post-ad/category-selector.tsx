'use client';

import { usePostAd } from '@/components/post-ad/form-provider';
import { CategoryIcon, CheckIcon } from '@/components/ui/icons';
import { CATEGORIES } from '@/config/categories';
import { cn } from '@/lib/utils';

/**
 * Category choice, read from the one category configuration the whole site
 * uses. The categories are never spelled out here — if a section is added to
 * the paper, it appears in this list, in the filters and on the homepage from
 * the same edit.
 *
 * Rendered as a radio group so arrow keys move between options and a screen
 * reader announces "3 of 9", which a grid of buttons would not.
 */
export function CategorySelector() {
  const { state, dispatch, errorFor } = usePostAd();
  const selected = state.classified.categorySlug;
  const error = errorFor('categorySlug');

  return (
    <fieldset data-step="category">
      <legend className="sr-only">Advertisement category</legend>

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        role="radiogroup"
        aria-label="Advertisement category"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'category-error' : undefined}
      >
        {CATEGORIES.map((category) => {
          const isSelected = selected === category.slug;
          return (
            <label
              key={category.slug}
              data-category-option={category.slug}
              className={cn(
                'flex cursor-pointer gap-3 rounded-md border bg-surface p-4 transition-colors',
                'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
                isSelected
                  ? 'border-primary bg-primary-surface'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <input
                type="radio"
                name="categorySlug"
                value={category.slug}
                checked={isSelected}
                onChange={() => {
                  dispatch({ type: 'setClassified', key: 'categorySlug', value: category.slug });
                  dispatch({ type: 'touch', path: 'categorySlug' });
                }}
                className="sr-only"
              />

              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm',
                  isSelected ? 'bg-primary-solid text-primary-fg' : 'bg-surface-sunken text-primary',
                )}
              >
                <CategoryIcon name={category.icon} size={20} />
              </span>

              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-serif text-base font-semibold">
                  {category.name}
                  {isSelected ? <CheckIcon size={15} className="text-primary" /> : null}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                  {category.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {error ? (
        <p id="category-error" className="mt-3 text-sm font-medium text-critical-fg">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
