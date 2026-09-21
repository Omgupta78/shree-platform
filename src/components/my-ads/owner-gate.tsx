import type { ReactNode } from 'react';

import { SignInRequired } from '@/components/auth/sign-in-required';
import { SetupNotice } from '@/components/setup-notice';
import { Container } from '@/components/ui/container';
import { getCurrentUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';

/**
 * The two states every owner page has before it has anything to show: no
 * database, or nobody signed in. `proxy.ts` has already redirected a
 * signed-out visitor; this is the second line, for a route that falls out of
 * the proxy's matcher one day.
 */
export async function OwnerGate({ next, children }: { next: string; children: ReactNode }) {
  if (!isSupabaseConfigured) {
    return (
      <Container className="py-10">
        <SetupNotice />
      </Container>
    );
  }
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Container className="py-16">
        <SignInRequired next={next} />
      </Container>
    );
  }
  return <>{children}</>;
}
