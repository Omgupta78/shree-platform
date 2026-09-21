'use client';

import { usePostAd } from '@/components/post-ad/form-provider';
import { SelectField, TextareaField, TextInput } from '@/components/ui/field';
import { CATEGORY_BY_SLUG } from '@/config/categories';
import { PRICE_LABEL, priceRole } from '@/config/category-fields';
import { LOCATIONS } from '@/config/locations';
import { DESCRIPTION_MAX, TITLE_MAX } from '@/lib/post-ad/schema';

/**
 * Title, description, location and price.
 *
 * Whether a price is asked for at all, and what it is called, comes from
 * `config/category-fields.ts` — the same configuration that decides whether
 * the public card shows a price line and whether the filters offer a price
 * range. A matrimonial notice is never asked for a figure.
 */
export function BasicDetailsForm() {
  const { state, dispatch, errorFor } = usePostAd();
  const values = state.classified;
  const category = CATEGORY_BY_SLUG.get(values.categorySlug);
  const role = priceRole(values.categorySlug);
  const priceLabel = PRICE_LABEL[role];

  const set = (key: 'title' | 'description' | 'locationSlug' | 'price', value: string) =>
    dispatch({ type: 'setClassified', key, value });

  const touch = (path: string) => dispatch({ type: 'touch', path });

  return (
    <div className="space-y-5" data-step="details">
      {category ? (
        <p className="text-sm text-fg-muted">
          Posting under{' '}
          <span className="font-semibold text-fg">{category.name}</span>.
        </p>
      ) : null}

      <TextInput
        label="Advertisement title"
        required
        data-field="title"
        value={values.title}
        maxLength={TITLE_MAX + 20}
        onChange={(event) => set('title', event.target.value)}
        onBlur={() => touch('title')}
        error={errorFor('title')}
        hint="A clear line a reader can scan. For example, “Two bedroom flat on rent near the college”."
      />

      <TextareaField
        label="Description"
        required
        data-field="description"
        rows={8}
        value={values.description}
        counterMax={DESCRIPTION_MAX}
        onChange={(event) => set('description', event.target.value)}
        onBlur={() => touch('description')}
        error={errorFor('description')}
        hint="What you are offering, the condition or terms, and anything a reader would ask on the telephone."
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Location"
          required
          data-field="locationSlug"
          value={values.locationSlug}
          onChange={(event) => {
            set('locationSlug', event.target.value);
            touch('locationSlug');
          }}
          onBlur={() => touch('locationSlug')}
          error={errorFor('locationSlug')}
        >
          <option value="">Choose a location</option>
          {LOCATIONS.map((location) => (
            <option key={location.slug} value={location.slug}>
              {location.name}
            </option>
          ))}
        </SelectField>

        {role === 'none' ? null : (
          <TextInput
            label={priceLabel}
            data-field="price"
            inputMode="numeric"
            value={values.price}
            onChange={(event) => set('price', event.target.value)}
            onBlur={() => touch('price')}
            error={errorFor('price')}
            placeholder="In rupees"
            hint={
              role === 'salary'
                ? 'Monthly, in rupees. Leave blank if it is negotiable.'
                : 'In rupees. Leave blank if it is negotiable or on request.'
            }
          />
        )}
      </div>
    </div>
  );
}
