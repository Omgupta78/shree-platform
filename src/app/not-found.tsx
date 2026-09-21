import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';

export default function NotFound() {
  return (
    <Container className="flex flex-col items-center py-24 text-center">
      <p className="font-serif text-6xl font-semibold text-line-strong">404</p>
      <h1 className="mt-6 text-2xl font-semibold">We could not find that page</h1>
      <p className="mt-3 max-w-md text-[0.9375rem] text-fg-muted">
        The advertisement may have expired or been removed. Try browsing the categories instead.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/">Back to home</Button>
        <Button href="/categories" variant="secondary">
          Browse categories
        </Button>
      </div>
    </Container>
  );
}
