import type { Metadata } from 'next';

import { AdminEmpty, AdminPageHeader } from '@/components/admin/admin-ui';
import { PackageEditor } from '@/components/admin/package-editor';
import { isAdministrator } from '@/lib/admin/guard';
import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Packages' };

/**
 * What an advertiser can buy, and what it costs.
 *
 * An administrator's page. A moderator reviews advertisements; setting the
 * rates is a different kind of decision, and `packages_write` is `is_admin()`
 * in the database, so a moderator who reached this page anyway would find that
 * nothing saved.
 *
 * Packages are edited, not created or deleted. The three — Basic, Standard,
 * Premium — are referenced by every advertisement ever booked, and
 * `packages.id` is a foreign key with ON DELETE RESTRICT: deleting one is
 * refused by the database, and adding a fourth is a decision about what the
 * business sells rather than a form field. Taking one off sale is what "On
 * sale" is for, and it leaves every advertisement already running on it alone.
 */
export default async function AdminPackagesPage() {
  const [admin, packages] = await Promise.all([isAdministrator(), readPackages()]);

  if (!admin) {
    return (
      <>
        <AdminPageHeader title="Packages" description="What an advertiser can buy." />
        <AdminEmpty
          title="For an administrator"
          description="Rates and package settings are changed by an administrator. A moderator reviews advertisements."
        />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Packages"
        description="What an advertiser can buy, what it costs, how long it runs and how many photographs it carries."
        count={packages.length}
      />

      <div className="mb-4 rounded-sm border border-accent-line bg-accent-surface p-3 text-sm leading-relaxed text-accent-fg">
        Changing a price does not change what anybody has already paid — every payment keeps the
        amount and the package it was raised against. A new rate applies to advertisements booked
        from now on.
      </div>

      {packages.length === 0 ? (
        <AdminEmpty
          title="No packages"
          description="The packages are created by the migrations. If none are listed, the database is not connected."
        />
      ) : (
        <div className="space-y-4">
          {packages.map((item) => (
            <PackageEditor key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}

async function readPackages() {
  if (!isSupabaseConfigured) return [];

  const supabase = await createSupabaseServerClient();
  // Staff read inactive packages too — `packages_select` is
  // `is_active or is_staff()` — so a package taken off sale can be put back.
  const { data } = await supabase
    .from('packages')
    .select('*')
    .order('sort_order', { ascending: true });

  return data ?? [];
}
