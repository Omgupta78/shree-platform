'use client';

import { useEffect } from 'react';

import { ResultsError } from '@/components/classifieds/result-states';
import { Container } from '@/components/ui/container';

export default function ClassifiedsError({
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
    <Container className="py-16">
      <ResultsError onRetry={reset} />
      {error.digest ? (
        <p className="mt-4 text-center text-xs text-fg-subtle">Reference: {error.digest}</p>
      ) : null}
    </Container>
  );
}
