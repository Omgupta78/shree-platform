'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

/**
 * Filter controls change the URL; the server re-renders the results.
 *
 * Keeping the URL authoritative means a filtered view is shareable, the back
 * button works, and no filtering logic has to be duplicated on the client.
 * `useTransition` keeps the current results on screen while the new page
 * streams in, instead of flashing a skeleton on every interaction.
 */
export function useQueryNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const push = useCallback(
    (params: URLSearchParams) => {
      const search = params.toString();
      startTransition(() => {
        router.push(search ? `${pathname}?${search}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  /** Sets or clears one parameter, returning to page one. */
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete('page');
      push(params);
    },
    [push, searchParams],
  );

  /** Sets several parameters at once, returning to page one. */
  const setParams = useCallback(
    (values: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(values)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.delete('page');
      push(params);
    },
    [push, searchParams],
  );

  /** Clears every filter, keeping the sort order. */
  const clearAll = useCallback(() => {
    const params = new URLSearchParams();
    const sort = searchParams.get('sort');
    if (sort) params.set('sort', sort);
    push(params);
  }, [push, searchParams]);

  const get = useCallback((key: string) => searchParams.get(key) ?? '', [searchParams]);

  /** True when anything other than sort and page is set. */
  const hasFilters = [...searchParams.keys()].some((key) => key !== 'sort' && key !== 'page');

  return { setParam, setParams, clearAll, get, hasFilters, isPending };
}

/**
 * A filter control's value, backed by the URL but updated optimistically.
 *
 * The URL is still authoritative, but writing to it goes through a transition,
 * so a purely controlled input would sit unchanged until the server responded
 * — on a slow connection the control feels broken. This mirrors the value
 * locally for instant feedback and re-syncs whenever the URL changes from
 * elsewhere: the back button, a filter chip being removed, or "clear all".
 */
export function useFilterValue(key: string) {
  const { setParam, get } = useQueryNavigation();
  const fromUrl = get(key);

  const [value, setValue] = useState(fromUrl);
  const [synced, setSynced] = useState(fromUrl);
  if (fromUrl !== synced) {
    setSynced(fromUrl);
    setValue(fromUrl);
  }

  const update = useCallback(
    (next: string) => {
      setValue(next);
      setParam(key, next || null);
    },
    [key, setParam],
  );

  return [value, update] as const;
}
