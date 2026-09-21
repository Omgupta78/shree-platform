import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------- loading -- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-sm bg-surface-sunken', className)}
      aria-hidden="true"
    />
  );
}

/** Placeholder matching the shape of a listing card, to avoid layout shift. */
export function AdCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <Skeleton className="aspect-4/3 rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-5 w-24" />
      </div>
    </div>
  );
}

export function AdGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      role="status"
      aria-label="Loading advertisements"
    >
      {Array.from({ length: count }, (_, i) => (
        <AdCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- empty -- */

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-md border border-dashed border-line-strong bg-surface px-6 py-14 text-center',
        className,
      )}
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-fg-muted">{description}</p>
      ) : null}
      {action ? (
        <Button href={action.href} className="mt-6" size="sm">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- error -- */

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  children?: ReactNode;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this section. Please try again in a moment.',
  onRetry,
  children,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-md border border-critical-line bg-critical-surface px-6 py-10 text-center"
    >
      <h3 className="text-lg font-semibold text-critical-fg">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">{description}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
      {children}
    </div>
  );
}
