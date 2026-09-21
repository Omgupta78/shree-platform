'use client';

import { useEffect } from 'react';

import { Container } from '@/components/ui/container';
import { ErrorState } from '@/components/ui/states';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with a reporting service when one is configured.
    console.error(error);
  }, [error]);

  return (
    <Container className="py-20">
      <ErrorState
        title="This page could not be loaded"
        description="The problem has been logged. Trying again usually works; if it does not, please contact our office."
        onRetry={reset}
      >
        {error.digest ? (
          <p className="mt-4 text-xs text-fg-subtle">Reference: {error.digest}</p>
        ) : null}
      </ErrorState>
    </Container>
  );
}
