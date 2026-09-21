import { Button } from '@/components/ui/button';

/**
 * The second line of defence.
 *
 * `proxy.ts` redirects a signed-out visitor away from a protected route before
 * the page renders, which is the real protection. This panel is what a page
 * shows if it is ever reached anyway — because the proxy's matcher was
 * narrowed, or because a route was added to the application and not to the
 * matcher. Two independent checks, so forgetting one does not expose anything:
 * the page still renders nothing but this.
 */
export function SignInRequired({
  title = 'Please sign in',
  description = 'This page shows your own advertisements, so we need to know who you are.',
  next,
}: {
  title?: string;
  description?: string;
  /** Path to return to once signed in. */
  next?: string;
}) {
  const query = next ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <div className="mx-auto max-w-md rounded-md border border-line bg-surface p-8 text-center">
      <h2 className="font-serif text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-[0.9375rem] text-fg-muted">{description}</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button href={`/sign-in${query}`}>Sign in</Button>
        <Button href={`/sign-up${query}`} variant="secondary">
          Create an account
        </Button>
      </div>
    </div>
  );
}
