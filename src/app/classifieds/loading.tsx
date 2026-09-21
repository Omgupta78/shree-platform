import {
  FilterSidebarSkeleton,
  ResultsSkeleton,
} from '@/components/classifieds/loading-skeleton';
import { Container } from '@/components/ui/container';
import { Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <div className="border-b border-line bg-surface">
        <Container className="pt-8 pb-0">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-10 w-64" />
          <Skeleton className="mt-3 h-4 w-96 max-w-full" />
          <div className="mt-6 flex gap-4 pb-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-5 w-20" />
            ))}
          </div>
        </Container>
      </div>

      <Container className="py-8">
        <Skeleton className="h-[5.5rem] w-full rounded-md" />
        <div className="mt-6 grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
          <FilterSidebarSkeleton />
          <div>
            <div className="flex items-center justify-between border-b border-line pb-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-11 w-44" />
            </div>
            <div className="mt-6">
              <ResultsSkeleton />
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}
