import { Skeleton } from '@/components/ui/states';

/** Shown while the office's lifecycle table is read. */
export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-20" />
      <Skeleton className="h-64" />
    </div>
  );
}
