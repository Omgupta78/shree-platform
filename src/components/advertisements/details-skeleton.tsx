import { Container } from '@/components/ui/container';
import { Skeleton } from '@/components/ui/states';

/**
 * Loading placeholder for the detail page, shaped like the real thing:
 * gallery on the left, title/price/contact on the right, then details,
 * description and the advertiser block.
 */
export function AdvertisementDetailsSkeleton() {
  return (
    <Container className="py-8">
      <Skeleton className="h-3 w-64" />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <div>
          <Skeleton className="aspect-4/3 w-full rounded-md" />
          <div className="mt-3 flex gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-20 rounded-sm" />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-52" />
          <div className="space-y-2.5 pt-2">
            <Skeleton className="h-12 w-full rounded-sm" />
            <Skeleton className="h-12 w-full rounded-sm" />
          </div>
          <Skeleton className="h-20 w-full rounded-md" />
        </div>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
      </div>
    </Container>
  );
}
