'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { ChevronDownIcon, SearchIcon } from '@/components/ui/icons';
import { CATEGORIES } from '@/config/categories';
import { LOCATIONS } from '@/config/locations';

/**
 * The hero search. A real GET form to `/classifieds`, so it still works
 * without JavaScript; the router push just makes it a client navigation.
 */

const SELECT_CLASS =
  'h-12 w-full appearance-none rounded-sm border border-line-strong bg-surface pr-9 pl-3 ' +
  'text-[0.9375rem] text-fg transition-colors hover:border-fg-subtle';

export function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (location) params.set('location', location);
    // Category is a route segment, not a query parameter.
    const base = category ? `/classifieds/${category}` : '/classifieds';
    const search = params.toString();
    router.push(search ? `${base}?${search}` : base);
  }

  return (
    <form
      role="search"
      action={category ? `/classifieds/${category}` : '/classifieds'}
      method="get"
      onSubmit={handleSubmit}
      className="rounded-md border border-line bg-surface p-3 shadow-card sm:p-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="relative">
          <label htmlFor="hero-q" className="sr-only">
            Search advertisements
          </label>
          <SearchIcon
            size={18}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle"
          />
          <input
            id="hero-q"
            name="q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search advertisements…"
            className="h-12 w-full rounded-sm border border-line-strong bg-surface pr-3 pl-10 text-[0.9375rem] text-fg transition-colors placeholder:text-fg-subtle hover:border-fg-subtle"
          />
        </div>

        <div className="relative">
          <label htmlFor="hero-category" className="sr-only">
            Category
          </label>
          <select
            id="hero-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={SELECT_CLASS}
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
          <label htmlFor="hero-location" className="sr-only">
            Location
          </label>
          <select
            id="hero-location"
            name="location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className={SELECT_CLASS}
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
