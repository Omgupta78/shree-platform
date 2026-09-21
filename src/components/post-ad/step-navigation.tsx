'use client';

import { usePostAd } from '@/components/post-ad/form-provider';
import { Button } from '@/components/ui/button';
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon } from '@/components/ui/icons';
import { errorsForStep } from '@/lib/post-ad/state';

/**
 * Back and Continue, and the reason Continue will not move.
 *
 * Continue is never disabled. A disabled button tells an advertiser nothing
 * about what is wrong with their advertisement and cannot be focused to find
 * out; this one is always pressable, and pressing it on an invalid step
 * reveals the errors, moves focus to the first one and says how many there
 * are. That is also why validation is not left to the browser: `required` on
 * an input gives one message, in one place, in the browser's own words.
 */
export function StepNavigation({ onContinue }: { onContinue?: () => void }) {
  const { state, dispatch, step, steps, errors, canContinue } = usePostAd();
  const stepErrors = errorsForStep(step, errors);
  const count = Object.keys(stepErrors).length;
  const showProblems = state.stepAttempted && count > 0;
  const first = state.stepIndex === 0;

  function handleContinue() {
    if (!canContinue) {
      dispatch({ type: 'attemptStep' });
      focusFirstInvalid();
      return;
    }
    dispatch({ type: 'next' });
    onContinue?.();
  }

  return (
    <div data-step-nav className="mt-8">
      {showProblems ? (
        <p
          role="alert"
          data-step-error
          className="mb-4 flex gap-2 rounded-sm border border-critical-line bg-critical-surface p-3 text-sm text-critical-fg"
        >
          <AlertIcon size={17} className="mt-px shrink-0" />
          {count === 1
            ? 'One field needs your attention before you can continue.'
            : `${count} fields need your attention before you can continue.`}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button
          variant="secondary"
          size="lg"
          data-nav="back"
          onClick={() => dispatch({ type: 'back' })}
          disabled={first}
        >
          <ArrowLeftIcon size={17} />
          Back
        </Button>

        <Button size="lg" data-nav="continue" onClick={handleContinue}>
          {state.stepIndex === steps.length - 2 ? 'Preview advertisement' : 'Continue'}
          <ArrowRightIcon size={17} />
        </Button>
      </div>
    </div>
  );
}

/**
 * Moves focus to the first control the step marked invalid.
 *
 * Read from the DOM rather than kept in state: the error paths do not know
 * which control renders them, and `aria-invalid` is already on the element
 * that failed, put there by the shared field wrapper.
 */
export function focusFirstInvalid() {
  if (typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(
      'main [aria-invalid="true"], main [data-step-error]',
    );
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}
