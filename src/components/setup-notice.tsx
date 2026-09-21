import { Container } from '@/components/ui/container';

/**
 * Shown when Supabase credentials are absent. Deliberately explicit: the site
 * never invents placeholder listings to fill the gap, because a demo ad that
 * looks real is worse than an obvious empty state.
 */
export function SetupNotice() {
  return (
    <Container className="py-6">
      <div className="rounded-md border border-accent-line bg-accent-surface p-5">
        <h2 className="text-sm font-semibold text-accent-fg">Database not connected yet</h2>
        <p className="mt-1.5 max-w-3xl text-sm text-accent-fg/90">
          Categories, locations and advertisements are read from Supabase. Add{' '}
          <code className="rounded-xs bg-canvas/60 px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{' '}
          and{' '}
          <code className="rounded-xs bg-canvas/60 px-1 py-0.5 text-xs">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{' '}
          to your environment, then run the migrations in{' '}
          <code className="rounded-xs bg-canvas/60 px-1 py-0.5 text-xs">supabase/migrations</code>.
          Setup steps are in the project README.
        </p>
      </div>
    </Container>
  );
}
