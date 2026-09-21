import type { Metadata } from 'next';

import { AdminEmpty, AdminPageHeader } from '@/components/admin/admin-ui';
import { CategoryManager } from '@/components/admin/category-manager';
import { getStaffMember } from '@/lib/admin/guard';
import { getCategories } from '@/lib/admin/office';

export const metadata: Metadata = { title: 'Categories' };

/**
 * The sections of the paper, as the site knows them.
 *
 * Administrators only. A category change moves every advertisement filed under
 * it and alters what the submission form offers, which is a different kind of
 * decision from approving one advertisement.
 */
export default async function CategoriesPage() {
  const staff = await getStaffMember();

  if (staff?.role !== 'admin') {
    return (
      <AdminEmpty
        title="Administrators only"
        description="Changing a category changes what every advertiser can choose and where existing advertisements sit."
      />
    );
  }

  const categories = await getCategories();

  return (
    <>
      <AdminPageHeader
        title="Categories"
        description="Two levels: a section, and the categories inside it. Hiding one keeps its advertisements; nothing here deletes."
        count={categories.length}
      />
      <CategoryManager categories={categories} />
    </>
  );
}
