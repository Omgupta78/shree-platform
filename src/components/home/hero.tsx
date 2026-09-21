import { Suspense } from 'react';

import { HeroSearch } from '@/components/home/hero-search';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { ACCOUNT_ACTIONS } from '@/config/navigation';
import { SITE } from '@/config/site';

/**
 * Hero.
 *
 * States what the platform is and gives the reader the search. No claims are
 * made about rank, size or audience — nothing of that kind is printed in the
 * paper, so nothing of that kind is asserted here.
 */
export function Hero() {
  return (
    <section className="border-b border-line bg-surface py-12 sm:py-16">
      <Container>
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            {SITE.city}, {SITE.state}
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-[1.12] font-semibold sm:text-5xl">
            Roorkee&rsquo;s Classified &amp; Advertising Platform
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg">
            Find local advertisements, publish your own advertisement, and promote your
            business with {SITE.name}.
          </p>
        </div>

        <div className="mt-8">
          <Suspense fallback={<div className="h-[5.5rem] rounded-md border border-line bg-surface" />}>
            <HeroSearch />
          </Suspense>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button href={ACCOUNT_ACTIONS.post.href} size="lg">
            Post Your Advertisement
          </Button>
          <p className="text-sm text-fg-muted">
            In print every {SITE.publishDay}, and online all week.
          </p>
        </div>
      </Container>
    </section>
  );
}
