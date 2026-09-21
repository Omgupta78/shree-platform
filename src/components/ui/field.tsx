'use client';

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/lib/utils';

// 16px on a phone, 15px from `sm` up. iOS Safari zooms the page whenever a
// focused control's text is under 16px, which on a form this long means the
// viewport jumping on every field.
const CONTROL =
  'h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-base sm:text-[0.9375rem] ' +
  'text-fg placeholder:text-fg-subtle transition-colors ' +
  'hover:border-fg-subtle disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-[invalid=true]:border-critical-fg';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/**
 * Wraps a control with its label, hint and error message, wiring up `id`,
 * `aria-describedby` and `aria-invalid` so the association is never forgotten.
 */
export function Field({ label, hint, error, required, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
        {required ? (
          <span className="ml-0.5 text-critical-fg" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {hint && !error ? (
        <p id={hintId} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-critical-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextInput({ label, hint, error, className, ...rest }: TextInputProps) {
  return (
    <Field label={label} hint={hint} error={error} required={rest.required}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(CONTROL, className)}
          {...rest}
        />
      )}
    </Field>
  );
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...rest
}: SelectFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} required={rest.required}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(CONTROL, 'pr-8', className)}
          {...rest}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

type TextareaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
  /** Renders a live "0 / 1000 characters" counter under the control. */
  counterMax?: number;
  value: string;
};

/**
 * A comfortable multi-line control with an optional character counter.
 *
 * The counter is a `role="status"` region so a screen-reader user is told
 * when they are near the limit, and it turns critical only once the limit is
 * actually exceeded — nagging at 900 of 1000 helps nobody.
 */
export function TextareaField({
  label,
  hint,
  error,
  counterMax,
  className,
  value,
  ...rest
}: TextareaFieldProps) {
  const over = counterMax !== undefined && value.length > counterMax;

  return (
    <Field label={label} hint={hint} error={error} required={rest.required}>
      {({ id, describedBy, invalid }) => (
        <>
          <textarea
            id={id}
            value={value}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(
              'block w-full rounded-sm border border-line-strong bg-surface p-3 text-base sm:text-[0.9375rem]',
              'text-fg placeholder:text-fg-subtle transition-colors',
              'hover:border-fg-subtle aria-[invalid=true]:border-critical-fg',
              className,
            )}
            {...rest}
          />
          {counterMax !== undefined ? (
            <p
              role="status"
              className={cn(
                'text-right text-xs tabular-nums',
                over ? 'font-medium text-critical-fg' : 'text-fg-subtle',
              )}
            >
              {value.length} / {counterMax} characters
            </p>
          ) : null}
        </>
      )}
    </Field>
  );
}

type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: string;
  hint?: string;
};

/** A checkbox whose whole row is the label, so the tap target is generous. */
export function CheckboxField({ label, hint, className, ...rest }: CheckboxFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="flex gap-3">
      <input
        id={id}
        type="checkbox"
        aria-describedby={hintId}
        className={cn('mt-0.5 h-5 w-5 shrink-0 accent-primary-solid', className)}
        {...rest}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-fg">
          {label}
        </label>
        {hint ? (
          <p id={hintId} className="mt-0.5 text-xs leading-relaxed text-fg-subtle">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
