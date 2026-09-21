import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminExpiryTable } from '@/components/admin/admin-expiry-table';
import { AdminPageHeader, AdminPagination } from '@/components/admin/admin-ui';
import { CATEGORIES } from '@/config/categories';
import {
  EXPIRY_RANGES,
  getExpiringAdvertisements,
  parseExpiringQuery,
  type ExpiringQuery,
} from '@/lib/admin/lifecycle';
import type { RawSearchParams } from '@/lib/admin/query';
import { getLifecycleSettings } from '@/lib/data/lifecycle-settings';

export const metadata: Metadata = { title: 'Expiring soon' };

function hrefFor(query: ExpiringQuery, overrides: Partial<ExpiringQuery>): string {
  const next = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (next.category) params.set('category', next.category);
  if (next.kind) params.set('kind', next.kind);
  params.set('range', String(next.withinDays));
  if (next.sort !== 'soonest') params.set('sort', next.sort);
  if (next.page > 1) params.set('page', String(next.page));
  return `/admin/advertisements/expiring?${params.toString()}`;
}

/**
 * Live advertisements approaching the end of their run. A plain GET form for
 * the filters, as on the queues, so a view can be bookmarked.
 */
export default async function ExpiringPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const settings = await getLifecycleSettings();
  const query = parseExpiringQuery(await searchParams, settings.expiringSoonDays);
  const result = await getExpiringAdvertisements(query);

  const select = 'h-9 w-full rounded-sm border border-line-strong bg-surface px-2 text-sm';

  return (
    <>
      <AdminPageHeader
        title="Expiring soon"
        description="Live advertisements whose run ends within the chosen window. Advertisers can renew from their dashboard; an administrator can extend a run from its review page."
        count={result.total}
      />

      <form action="/admin/advertisements/expiring" method="get" className="mb-4 rounded-md border border-line bg-surface p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="sr-only">Category</span>
            <select name="category" defaultValue={query.category ?? ''} className={select}>
              <option value="">Any category</option>
              {CATEGORIES.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Advertisement type</span>
            <select name="kind" defaultValue={query.kind ?? ''} className={select}>
              <option value="">Both kinds</option>
              <option value="classified">Classified</option>
              <option value="display">Display</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Expiry range</span>
            <select name="range" defaultValue={String(query.withinDays)} className={select}>
              {EXPIRY_RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Order</span>
            <select name="sort" defaultValue={query.sort} className={select}>
              <option value="soonest">Soonest expiry</option>
              <option value="latest">Latest expiry</option>
            </select>
          </label>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="submit"
            className="h-9 rounded-sm bg-primary-solid px-4 text-sm font-medium text-primary-fg hover:bg-primary-solid-hover"
          >
            Apply
          </button>
          <Link href="/admin/advertisements/expiring" className="text-sm text-fg-muted hover:underline">
            Reset
          </Link>
        </div>
      </form>

      <AdminExpiryTable items={result.items} soonDays={settings.expiringSoonDays} />
      <AdminPagination
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={(page) => hrefFor(query, { page })}
      />
    </>
  );
}
