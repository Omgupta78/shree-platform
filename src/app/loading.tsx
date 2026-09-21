import { Container } from '@/components/ui/container';
import { AdGridSkeleton, Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <Container className="py-14">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-3 h-5 w-96 max-w-full" />
      <div className="mt-10">
        <AdGridSkeleton />
      </div>
    </Container>
  );
}
