'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { ChevronDownIcon, SearchIcon } from '@/components/ui/icons';
import { CATEGORIES } from '@/config/categories';
import { LOCATIONS } from '@/config/locations';
import { cn } from '@/lib/utils';

const SELECT =
  'h-12 w-full appearance-none rounded-sm border border-line-strong bg-surface pr-9 pl-3 ' +
  'text-[0.9375rem] text-fg transition-colors hover:border-fg-subtle';

/**
 * The search bar at the top of every browsing page.
 *
 * A real GET form, so it works without JavaScript and the resulting URL is the
 * same either way. On a category page the category select is preset and
 * changing it navigates to that category's page.
 */
export function SearchPanel({
  initialQuery,
  initialLocation,
  categorySlug,
}: {
  initialQuery: string;
  initialLocation: string | null;
  categorySlug: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [category, setCategory] = useState(categorySlug ?? '');
  const [location, setLocation] = useState(initialLocation ?? '');

  // Keep the fields in step when the URL changes from elsewhere — a filter
  // chip being removed, or the back button. Adjusting state during render is
  // React's documented way to reset on a prop change; an effect would cause an
  // extra render pass and a visible flicker of the stale value.
  const incoming = `${initialQuery}\u0000${initialLocation ?? ''}\u0000${categorySlug ?? ''}`;
  const [synced, setSynced] = useState(incoming);
  if (incoming !== synced) {
    setSynced(incoming);
    setQ(initialQuery);
    setLocation(initialLocation ?? '');
    setCategory(categorySlug ?? '');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (location) params.set('location', location);
    const base = category ? `/classifieds/${category}` : '/classifieds';
    const search = params.toString();
    router.push(search ? `${base}?${search}` : base);
  }

  return (
    <form
      role="search"
      method="get"
      action={category ? `/classifieds/${category}` : '/classifieds'}
      onSubmit={submit}
      className="rounded-md border border-line bg-surface p-3 shadow-card sm:p-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="relative">
          <label htmlFor="cl-q" className="sr-only">
            Search advertisements
          </label>
          <SearchIcon
            size={18}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle"
          />
          <input
            id="cl-q"
            name="q"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search advertisements…"
            className="h-12 w-full rounded-sm border border-line-strong bg-surface pr-3 pl-10 text-[0.9375rem] text-fg transition-colors placeholder:text-fg-subtle hover:border-fg-subtle"
          />
        </div>

        <div className="relative">
          <label htmlFor="cl-category" className="sr-only">
            Category
          </label>
          <select
            id="cl-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={cn(SELECT)}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            size={16}
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-subtle"
          />
        </div>

        <div className="relative">
          <label htmlFor="cl-location" className="sr-only">
            Location
          </label>
          <select
            id="cl-location"
            name="location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className={cn(SELECT)}
          >
            <option value="">All locations</option>
            {LOCATIONS.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            size={16}
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-subtle"
          />
        </div>

        <Button type="submit" size="lg" className="h-12 lg:px-8">
          <SearchIcon size={17} />
          Search
        </Button>
      </div>
    </form>
  );
}
