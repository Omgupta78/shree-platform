import type { ReactNode } from 'react';

import { Container } from '@/components/ui/container';

/**
 * The account pages share one narrow, centred column.
 *
 * A route group rather than a path segment, so the URLs stay `/sign-in` and
 * `/sign-up` — short enough to say over the telephone, which is how the office
 * will be giving them out.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Container className="py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </Container>
  );
}
