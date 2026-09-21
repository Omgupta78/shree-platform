import { Skeleton } from '@/components/ui/states';

/**
 * Placeholder matching the real card: image panel, category line, two title
 * lines, two body lines, a details row, a price and a footer rule. Matching
 * the shape is the point — a differently proportioned skeleton causes a jump
 * when the real content lands.
 */
export function AdvertisementCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <Skeleton className="aspect-4/3 rounded-none" />
      <div className="space-y-2.5 p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/5" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
        <div className="flex gap-3 pt-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-6 w-28" />
        <div className="flex justify-between border-t border-line pt-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}

export function ResultsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading advertisements">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <AdvertisementCardSkeleton key={index} />
        ))}
      </div>
      <span className="sr-only">Loading advertisements…</span>
    </div>
  );
}

/** Sidebar placeholder, so the two-column layout does not shift on load. */
export function FilterSidebarSkeleton() {
  return (
    <div className="hidden lg:block">
      <div className="rounded-md border border-line bg-surface p-5">
        <Skeleton className="h-6 w-20" />
        <div className="mt-6 space-y-6">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
