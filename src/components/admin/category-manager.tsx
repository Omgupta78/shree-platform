'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { saveCategoryAction } from '@/app/admin/actions';
import { AdminDialog } from '@/components/admin/dialog';
import { AdminPanel, Td, Th, AdminTable } from '@/components/admin/admin-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AdminCategory } from '@/lib/admin/labels';

/**
 * Categories.
 *
 * There is no delete. A category with advertisements in it cannot be removed
 * without deciding what happens to them, and the schema says so — `ads`
 * references `categories` with ON DELETE RESTRICT. Deactivating takes it off
 * the public site and out of the submission form while leaving every
 * advertisement exactly where it is, which is what "remove this category"
 * nearly always means in practice. The row shows how many advertisements would
 * be affected, so the decision is made with the number in view.
 *
 * Ordering is a number rather than drag-and-drop. Two people editing an order
 * by dragging produce a silent last-write-wins fight over every sibling;
 * typing 30 changes one row.
 */
type Draft = {
  id?: string;
  parentId: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

const BLANK: Draft = {
  parentId: '',
  name: '',
  slug: '',
  description: '',
  sortOrder: 100,
  isActive: true,
};

export function CategoryManager({ categories }: { categories: AdminCategory[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edit(category: AdminCategory, parentId: string | null) {
    setDraft({
      id: category.id,
      parentId: parentId ?? '',
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    });
    setError(null);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);

    const result = await saveCategoryAction({
      id: draft.id,
      parentId: draft.parentId || undefined,
      name: draft.name,
      slug: draft.slug,
      description: draft.description,
      sortOrder: draft.sortOrder,
      isActive: draft.isActive,
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? 'That could not be saved.');
      return;
    }
    setDraft(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setDraft({ ...BLANK })}>
          New category
        </Button>
      </div>

      <div className="space-y-4">
        {categories.map((group) => (
          <AdminPanel key={group.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {group.name}
                  {group.isActive ? null : <Badge tone="danger">Hidden</Badge>}
                  <span className="font-mono text-xs font-normal text-fg-subtle">
                    {group.slug}
                  </span>
                </h2>
                <p className="mt-0.5 text-xs text-fg-muted">
                  order {group.sortOrder} · {group.liveAdCount} live of {group.adCount}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => edit(group, null)}>
                Edit
              </Button>
            </div>

            {group.children.length > 0 ? (
              <AdminTable
                caption={`${group.name} subcategories`}
                head={
                  <>
                    <Th>Subcategory</Th>
                    <Th className="w-48">Slug</Th>
                    <Th className="w-20">Order</Th>
                    <Th className="w-28">Advertisements</Th>
                    <Th className="w-24">Shown</Th>
                    <Th className="w-20">
                      <span className="sr-only">Edit</span>
                    </Th>
                  </>
                }
              >
                {group.children.map((child) => (
                  <tr key={child.id} className="hover:bg-surface-sunken">
                    <Td className="font-medium">{child.name}</Td>
                    <Td className="font-mono text-xs text-fg-muted">{child.slug}</Td>
                    <Td className="tabular-nums text-fg-muted">{child.sortOrder}</Td>
                    <Td className="tabular-nums text-fg-muted">
                      {child.liveAdCount} / {child.adCount}
                    </Td>
                    <Td>
                      {child.isActive ? <Badge>Yes</Badge> : <Badge tone="danger">Hidden</Badge>}
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={() => edit(child, group.id)}>
                        Edit
                      </Button>
                    </Td>
                  </tr>
                ))}
              </AdminTable>
            ) : (
              <p className="px-4 py-4 text-sm text-fg-muted">No subcategories.</p>
            )}
          </AdminPanel>
        ))}
      </div>

      <AdminDialog
        open={draft !== null}
        title={draft?.id ? 'Edit category' : 'New category'}
        confirmLabel={draft?.id ? 'Save changes' : 'Create it'}
        busy={busy}
        error={error}
        disabled={!draft?.name || !draft?.slug}
        onConfirm={() => void save()}
        onClose={() => {
          if (!busy) {
            setDraft(null);
            setError(null);
          }
        }}
      >
        {draft ? (
          <div className="space-y-4">
            <Text
              label="Name"
              value={draft.name}
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <Text
              label="Slug"
              value={draft.slug}
              hint="Lowercase letters, numbers and single hyphens. It appears in the URL, so changing it on a live category breaks links people have saved."
              onChange={(slug) => setDraft({ ...draft, slug })}
            />
            <Text
              label="Description"
              value={draft.description}
              onChange={(description) => setDraft({ ...draft, description })}
            />

            <label className="block">
              <span className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
                Parent
              </span>
              <select
                value={draft.parentId}
                onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
                className="mt-1.5 h-10 w-full rounded-sm border border-line-strong bg-surface px-2 text-sm"
              >
                <option value="">None — a top-level section</option>
                {categories
                  .filter((category) => category.id !== draft.id)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>

            <div className="flex flex-wrap items-end gap-4">
              <label className="block">
                <span className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
                  Order
                </span>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={draft.sortOrder}
                  onChange={(event) =>
                    setDraft({ ...draft, sortOrder: Number(event.target.value) || 0 })
                  }
                  className="mt-1.5 h-10 w-28 rounded-sm border border-line-strong bg-surface px-3 text-sm tabular-nums"
                />
              </label>

              <label className="flex items-center gap-2.5 pb-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
                  className="h-5 w-5 accent-primary-solid"
                />
                Show on the site
              </label>
            </div>

            {draft.id && !draft.isActive ? (
              <p className="rounded-sm border border-accent-line bg-accent-surface p-3 text-xs text-accent-fg">
                Hiding a category removes it from browsing and from the submission form.
                Advertisements already in it stay where they are and keep their pages.
              </p>
            ) : null}
          </div>
        ) : null}
      </AdminDialog>
    </>
  );
}

function Text({
  label,
  value,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  hint?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm"
      />
      {hint ? <span className="mt-1 block text-xs text-fg-subtle">{hint}</span> : null}
    </label>
  );
}
