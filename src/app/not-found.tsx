import Link from 'next/link';

import { CATEGORIES } from '@/config/categories';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';

/**
 * The application's own 404.
 *
 * Three ways onward, because a dead end is the only genuinely unrecoverable
 * thing a website can do to somebody: search for what they wanted, browse the
 * sections, or go home.
 *
 * The search is a plain GET form to `/classifieds`, so it works before any
 * JavaScript loads — which on a 404 reached from a search result is exactly
 * when somebody is most likely to give up.
 *
 * A missing ADVERTISEMENT does not reach this page. It is caught in the proxy
 * and served by `/classifieds/unavailable`, which can set a real 404 status
 * where a page cannot; see `lib/seo/missing.ts`.
 */
export default function NotFound() {
  return (
    <Container className="py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-serif text-6xl font-semibold text-line-strong">404</p>
        <h1 className="mt-6 text-2xl font-semibold">We could not find that page</h1>
        <p className="mx-auto mt-3 max-w-md text-[0.9375rem] text-fg-muted">
          The address may have been mistyped, or the page may have moved. Try searching for
          what you were after.
        </p>

        <form
          action="/classifieds"
          method="get"
          role="search"
          className="mx-auto mt-8 flex max-w-md flex-wrap gap-2"
        >
          <input
            type="search"
            name="q"
            aria-label="Search advertisements"
            placeholder="Search advertisements"
            className="h-11 min-w-0 flex-1 rounded-sm border border-line-strong bg-surface px-3 text-base sm:text-[0.9375rem]"
          />
          <Button type="submit">Search</Button>
        </form>

        <nav aria-label="Sections" className="mt-10">
          <h2 className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
            Browse a section
          </h2>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/classifieds/${category.slug}`}
                  className="inline-block rounded-full border border-line-strong px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="mt-10">
          <Link href="/" className="text-primary hover:underline">
            Back to the home page
          </Link>
        </p>
      </div>
    </Container>
  );
}
