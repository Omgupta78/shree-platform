import type { Metadata } from 'next';

import { AdminEmpty, AdminPageHeader } from '@/components/admin/admin-ui';
import { UserTable } from '@/components/admin/user-table';
import { getStaffMember } from '@/lib/admin/guard';
import { getUsers } from '@/lib/admin/office';
import type { RawSearchParams } from '@/lib/admin/query';

export const metadata: Metadata = { title: 'Users' };

/**
 * Accounts. Administrators only — a moderator reviews advertisements and has
 * no reason to read the customer list.
 *
 * The refusal below is rendered rather than redirected for the same reason as
 * everywhere else in this application: `redirect()` from a Server Component is
 * swallowed in this version of Next.js, so a page that "redirected" would
 * answer 200 and render its contents to the person it was refusing.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const staff = await getStaffMember();

  if (staff?.role !== 'admin') {
    return (
      <AdminEmpty
        title="Administrators only"
        description="The account list is not part of reviewing advertisements. Ask an administrator if you need something from it."
      />
    );
  }

  const params = await searchParams;
  const search = (Array.isArray(params.q) ? params.q[0] : params.q) ?? '';
  const users = await getUsers(search);

  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Everyone with an account. Roles are granted in the database, not here."
        count={users.length}
      />

      <form action="/admin/users" method="get" className="mb-4 flex flex-wrap gap-2">
        <label className="min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Search accounts</span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Name or email address"
            className="h-9 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm placeholder:text-fg-subtle"
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-sm bg-primary-solid px-4 text-sm font-medium text-primary-fg hover:bg-primary-solid-hover"
        >
          Search
        </button>
      </form>

      <UserTable users={users} currentUserId={staff.id} />

      <p className="mt-4 max-w-2xl text-xs text-fg-subtle">
        To make somebody a moderator or an administrator, run{' '}
        <code className="rounded-xs bg-surface-sunken px-1 py-0.5">
          update public.profiles set role = &apos;admin&apos; where email = &apos;…&apos;
        </code>{' '}
        in the Supabase SQL editor. There is deliberately no button for it: granting a role is
        rare, and an interface that can do it is an interface that can be tricked into doing it.
        Every role change is recorded in the activity log either way.
      </p>
    </>
  );
}
