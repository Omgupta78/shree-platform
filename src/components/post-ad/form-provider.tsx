'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';

import type { FieldErrors } from '@/lib/post-ad/schema';
import {
  initialState,
  isStepValid,
  reducer,
  validate,
  visibleError,
  type PostAdAction,
  type PostAdState,
} from '@/lib/post-ad/state';
import { stepsFor, type StepDefinition } from '@/lib/post-ad/steps';

/**
 * Form state, shared.
 *
 * A reducer in context rather than a form library: the state is a plain
 * object, the reducer is pure and unit-testable, and the validation is the
 * same zod schema the server will use. Bringing in a form library would add a
 * second description of the form to keep in step with the first.
 *
 * Validation is derived, never stored. The errors below are recomputed from
 * state on every render, so there is no moment when the form believes
 * something about itself that its values contradict.
 */

interface PostAdContextValue {
  state: PostAdState;
  dispatch: Dispatch<PostAdAction>;
  steps: readonly StepDefinition[];
  step: StepDefinition;
  errors: FieldErrors;
  /** The message to show for a field, or undefined while it is untouched. */
  errorFor: (path: string) => string | undefined;
  canContinue: boolean;
  isLastStep: boolean;
}

const PostAdContext = createContext<PostAdContextValue | null>(null);

export function PostAdProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const errors = useMemo(() => validate(state), [state]);
  const steps = stepsFor(state.advertisementType);
  const step = steps[Math.min(state.stepIndex, steps.length - 1)] as StepDefinition;

  const errorFor = useCallback(
    (path: string) => visibleError(state, errors, path),
    [state, errors],
  );

  const value = useMemo<PostAdContextValue>(
    () => ({
      state,
      dispatch,
      steps,
      step,
      errors,
      errorFor,
      canContinue: isStepValid(state, errors),
      isLastStep: state.stepIndex >= steps.length - 1,
    }),
    [state, steps, step, errors, errorFor],
  );

  return <PostAdContext.Provider value={value}>{children}</PostAdContext.Provider>;
}

export function usePostAd(): PostAdContextValue {
  const value = useContext(PostAdContext);
  if (!value) throw new Error('usePostAd must be used inside <PostAdProvider>.');
  return value;
}
