import { Container } from '@/components/ui/container';
import { Skeleton } from '@/components/ui/states';

/** Shown while the advertiser's own rows are read. */
export default function Loading() {
  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </Container>
  );
}
