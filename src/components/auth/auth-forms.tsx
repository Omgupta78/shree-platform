'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, type ReactNode } from 'react';

import {
  forgotPasswordAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
} from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { AlertIcon, CheckIcon } from '@/components/ui/icons';
import { IDLE, MIN_PASSWORD, type AuthFormState } from '@/lib/auth/schema';

/**
 * The account forms.
 *
 * Progressive enhancement is the point of the shape here: each one is a real
 * `<form action={...}>`, so it submits and works with JavaScript unavailable,
 * and `useActionState` only adds the pending state and the inline errors on
 * top. The navigation after success is the one piece that needs the client,
 * and it is a single effect rather than a redirect inside the action.
 */

function useRedirectOnSuccess(state: AuthFormState) {
  const router = useRouter();

  useEffect(() => {
    if (state.status !== 'done' || !state.redirectTo) return;
    router.replace(state.redirectTo);
    // The session lives in a cookie the server reads, so the cached Server
    // Component output has to be discarded or the header still says "Sign in".
    router.refresh();
  }, [router, state]);
}

function FormMessage({ state }: { state: AuthFormState }) {
  if (!state.message) return null;

  const failed = state.status === 'error';
  return (
    <p
      role={failed ? 'alert' : 'status'}
      className={
        failed
          ? 'flex gap-2 rounded-sm border border-critical-line bg-critical-surface p-3 text-sm text-critical-fg'
          : 'flex gap-2 rounded-sm border border-line bg-surface-sunken p-3 text-sm text-fg-muted'
      }
    >
      {failed ? (
        <AlertIcon size={17} className="mt-px shrink-0" />
      ) : (
        <CheckIcon size={17} className="mt-px shrink-0" />
      )}
      {state.message}
    </p>
  );
}

function Submit({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" fullWidth disabled={pending} aria-busy={pending || undefined}>
      {pending ? 'Please wait…' : children}
    </Button>
  );
}

/* --------------------------------------------------------------- sign in -- */

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAction, IDLE);
  useRedirectOnSuccess(state);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />

      <TextInput
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />
      <TextInput
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />

      <Submit pending={pending}>Sign in</Submit>

      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/forgot-password" className="text-primary underline underline-offset-2">
          Forgotten your password?
        </Link>
        <Link href="/sign-up" className="text-primary underline underline-offset-2">
          Create an account
        </Link>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- sign up -- */

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUpAction, IDLE);
  useRedirectOnSuccess(state);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />

      <TextInput
        label="Your name"
        name="fullName"
        autoComplete="name"
        required
        error={state.fieldErrors?.fullName}
      />
      <TextInput
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        required
        hint="We use this to confirm your account and to reach you about your advertisements."
        error={state.fieldErrors?.email}
      />
      <TextInput
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        hint="Optional. This is not published — each advertisement carries its own contact number."
        error={state.fieldErrors?.phone}
      />
      <TextInput
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={`At least ${MIN_PASSWORD} characters. A short phrase you will remember beats a short password you will not.`}
        error={state.fieldErrors?.password}
      />

      <Submit pending={pending}>Create account</Submit>

      <p className="text-sm text-fg-muted">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-primary underline underline-offset-2">
          Sign in
        </Link>
        .
      </p>
    </form>
  );
}

/* ------------------------------------------------------- forgot password -- */

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, IDLE);

  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} />

      {state.status === 'done' ? null : (
        <>
          <TextInput
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
            required
            error={state.fieldErrors?.email}
          />
          <Submit pending={pending}>Send the link</Submit>
        </>
      )}

      <p className="text-sm text-fg-muted">
        <Link href="/sign-in" className="text-primary underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

/* ------------------------------------------------------- update password -- */

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, IDLE);
  useRedirectOnSuccess(state);

  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} />

      <TextInput
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={`At least ${MIN_PASSWORD} characters.`}
        error={state.fieldErrors?.password}
      />
      <TextInput
        label="Type it again"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />

      <Submit pending={pending}>Change my password</Submit>
    </form>
  );
}
