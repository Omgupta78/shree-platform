import Link from 'next/link';

import { CATEGORIES } from '@/config/categories';
import { LOCATIONS } from '@/config/locations';
import {
  ADMIN_PERIODS,
  ADMIN_SORTS,
  ADMIN_STATUSES,
  adminQueryHref,
  isDefaultAdminQuery,
  type AdminAdQuery,
} from '@/lib/admin/query';

/**
 * The queue filters.
 *
 * A plain GET form. No JavaScript, no controlled inputs, no state — the URL is
 * the state, which means a filtered queue can be bookmarked, sent to a
 * colleague, or reopened tomorrow morning exactly as it was left. It also
 * means the filters work while the page is still streaming, which matters on
 * the screen somebody uses all day.
 */
export function AdminFilters({
  query,
  basePath,
  showStatus,
}: {
  query: AdminAdQuery;
  basePath: string;
  showStatus: boolean;
}) {
  const dirty = !isDefaultAdminQuery(query, showStatus);

  return (
    <form
      action={basePath}
      method="get"
      className="mb-4 rounded-md border border-line bg-surface p-3"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <label className="lg:col-span-2">
          <span className="sr-only">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={query.q}
            placeholder="Reference, title, advertiser, email or phone"
            className="h-9 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm placeholder:text-fg-subtle"
          />
        </label>

        {showStatus ? (
          <Select name="status" label="Status" value={query.status ?? ''} placeholder="Any status">
            {ADMIN_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        ) : null}

        <Select name="category" label="Category" value={query.category ?? ''} placeholder="Any category">
          {CATEGORIES.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </Select>

        <Select name="location" label="Location" value={query.location ?? ''} placeholder="Anywhere">
          {LOCATIONS.map((location) => (
            <option key={location.slug} value={location.slug}>
              {location.name}
            </option>
          ))}
        </Select>

        <Select name="kind" label="Kind" value={query.kind ?? ''} placeholder="Both kinds">
          <option value="classified">Classified</option>
          <option value="display">Display</option>
        </Select>

        <Select
          name="period"
          label="Submitted"
          value={query.withinDays ? String(query.withinDays) : ''}
          placeholder="Any time"
        >
          {ADMIN_PERIODS.map((period) => (
            <option key={period.value} value={period.value}>
              {period.label}
            </option>
          ))}
        </Select>

        <Select name="sort" label="Order" value={query.sort} placeholder="">
          {ADMIN_SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="h-9 rounded-sm bg-primary-solid px-4 text-sm font-medium text-primary-fg hover:bg-primary-solid-hover"
        >
          Apply
        </button>
        {dirty ? (
          <Link
            href={adminQueryHref(basePath, query, {
              q: '',
              status: showStatus ? null : query.status,
              category: null,
              location: null,
              kind: null,
              withinDays: null,
            }, showStatus)}
            className="text-sm text-fg-muted underline-offset-4 hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function Select({
  name,
  label,
  value,
  placeholder,
  children,
}: {
  name: string;
  label: string;
  value: string;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="h-9 w-full rounded-sm border border-line-strong bg-surface px-2 text-sm"
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {children}
      </select>
    </label>
  );
}
