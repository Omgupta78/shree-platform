'use client';

import { usePostAd } from '@/components/post-ad/form-provider';
import { SelectField, TextInput } from '@/components/ui/field';
import { categoryFormFields, type AdFormField } from '@/config/ad-form-fields';
import { CATEGORY_BY_SLUG } from '@/config/categories';

/**
 * The extra fields a category asks for.
 *
 * One generic renderer over `config/ad-form-fields.ts` — there is no branch
 * per category anywhere in this file, and adding a field to a category needs
 * no change here at all. The same configuration builds the validation schema,
 * so what is shown and what is enforced cannot drift apart.
 */
export function CategorySpecificFields() {
  const { state, dispatch, errorFor } = usePostAd();
  const categorySlug = state.classified.categorySlug;
  const fields = categoryFormFields(categorySlug);
  const category = CATEGORY_BY_SLUG.get(categorySlug);

  if (!categorySlug) {
    return (
      <p className="rounded-md border border-dashed border-line-strong bg-surface p-6 text-sm text-fg-muted">
        Choose a category first and the relevant fields will appear here.
      </p>
    );
  }

  if (fields.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        This category needs nothing further. Please continue.
      </p>
    );
  }

  return (
    <div className="space-y-5" data-step="specifics">
      {category ? (
        <p className="text-sm text-fg-muted">
          These appear beside your advertisement and help readers filter{' '}
          <span className="font-semibold text-fg">{category.name}</span>.
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((field) => (
          <CategoryField
            key={field.key}
            field={field}
            value={state.classified.categorySpecificData[field.key] ?? ''}
            error={errorFor(`categorySpecificData.${field.key}`)}
            onChange={(value) => dispatch({ type: 'setCategoryField', key: field.key, value })}
            onBlur={() => dispatch({ type: 'touch', path: `categorySpecificData.${field.key}` })}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryField({
  field,
  value,
  error,
  onChange,
  onBlur,
}: {
  field: AdFormField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  if (field.kind === 'select') {
    return (
      <SelectField
        label={field.label}
        required={field.required}
        hint={field.hint}
        error={error}
        data-field={field.key}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onBlur();
        }}
        onBlur={onBlur}
      >
        <option value="">Choose an option</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </SelectField>
    );
  }

  const numeric = field.kind === 'number';

  return (
    <TextInput
      label={field.unit ? `${field.label} (${field.unit})` : field.label}
      required={field.required}
      hint={field.hint}
      error={error}
      data-field={field.key}
      value={value}
      inputMode={numeric ? 'numeric' : undefined}
      maxLength={numeric ? 12 : (field.maxLength ?? 100) + 20}
      placeholder={field.placeholder}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  );
}
