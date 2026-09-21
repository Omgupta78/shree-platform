'use client';

import { usePostAd } from '@/components/post-ad/form-provider';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * Where the advertiser is in the form.
 *
 * Two presentations of one truth. On a phone there is no room for eight
 * labelled steps, so it becomes a bar with "Step 3 of 8" and the current
 * label — squeezing the full list into 390 pixels produces text nobody can
 * read. From `sm` upwards the whole list is shown, completed steps are
 * clickable so going back is one tap, and steps not yet reached are not.
 */
export function FormProgress() {
  const { state, steps, dispatch } = usePostAd();
  const current = Math.min(state.stepIndex, steps.length - 1);
  const step = steps[current];
  const percent = ((current + 1) / steps.length) * 100;

  return (
    <div data-progress className="border-b border-line pb-5">
      {/* Phone */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
            Step {current + 1} of {steps.length}
          </p>
          <p className="font-serif text-base font-semibold">{step?.label}</p>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={current + 1}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-label={`Step ${current + 1} of ${steps.length}: ${step?.label ?? ''}`}
        >
          <div
            className="h-full rounded-full bg-primary-solid transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Tablet and desktop */}
      <ol className="hidden flex-wrap items-center gap-x-2 gap-y-2 sm:flex">
        {steps.map((item, index) => {
          const done = index < current;
          const active = index === current;
          // Reachable, not valid: a step already visited stays one click away,
          // so correcting something from the preview is not a walk back
          // through every step in between.
          const reachable = index <= state.maxStepReached && !active;

          return (
            <li key={item.id} className="flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden="true" className="h-px w-4 bg-line lg:w-6" />
              ) : null}

              <button
                type="button"
                data-step-link={item.id}
                onClick={() => dispatch({ type: 'goToStep', index })}
                disabled={!reachable}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-sm px-1.5 py-1 text-sm transition-colors',
                  reachable && 'text-fg-muted hover:text-primary',
                  active && 'font-semibold text-fg',
                  !reachable && !active && 'cursor-default text-fg-subtle',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                    done && 'bg-positive-surface text-positive-fg',
                    active && 'bg-primary-solid text-primary-fg',
                    !done && !active && 'border border-line-strong text-fg-subtle',
                  )}
                >
                  {done ? <CheckIcon size={13} /> : index + 1}
                </span>
                {item.label}
                {reachable ? <span className="sr-only"> (go to this step)</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
