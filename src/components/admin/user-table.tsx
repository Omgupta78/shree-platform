'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { setUserBlockedAction } from '@/app/admin/actions';
import { AdminDialog } from '@/components/admin/dialog';
import { AdminEmpty, AdminTable, Td, Th } from '@/components/admin/admin-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AdminUser } from '@/lib/admin/labels';
import { formatDate, formatRelative } from '@/lib/format';

/**
 * The account list.
 *
 * There is exactly one thing this table can do to a person, and it is blocking
 * them. In particular there is no control that grants a role, anywhere, on
 * purpose: an interface that can make somebody an administrator is an
 * interface that can be tricked into making somebody an administrator, and the
 * office needs to do it about once. Promotion is done in the Supabase SQL
 * editor, which the schema treats as a trusted connection — the same route by
 * which the first administrator exists at all.
 *
 * No telephone numbers. The number an advertiser gave for an advertisement is
 * on that advertisement's review page, which is where the office would ring
 * from; the account list has no use for it, and the view this reads does not
 * carry it.
 */
export function UserTable({ users, currentUserId }: { users: AdminUser[]; currentUserId: string }) {
  const router = useRouter();
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!users.length) {
    return <AdminEmpty title="No accounts match" description="Try a different name or address." />;
  }

  async function confirm() {
    if (!target) return;
    setBusy(true);
    setError(null);

    const result = await setUserBlockedAction({
      userId: target.id,
      blocked: !target.isBlocked,
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? 'That could not be saved.');
      return;
    }
    setTarget(null);
    router.refresh();
  }

  return (
    <>
      <div className="rounded-md border border-line bg-surface">
        <AdminTable
          caption="Accounts"
          head={
            <>
              <Th>Name</Th>
              <Th className="w-56">Email</Th>
              <Th className="w-24">Role</Th>
              <Th className="w-28">Ads</Th>
              <Th className="w-32">Joined</Th>
              <Th className="w-28">Status</Th>
              <Th className="w-24">
                <span className="sr-only">Action</span>
              </Th>
            </>
          }
        >
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-surface-sunken">
              <Td className="font-medium">
                {user.name}
                {user.id === currentUserId ? (
                  <span className="ml-2 text-xs font-normal text-fg-subtle">you</span>
                ) : null}
                {user.lastSubmissionAt ? (
                  <span className="mt-0.5 block text-xs text-fg-subtle">
                    last sent {formatRelative(user.lastSubmissionAt)}
                  </span>
                ) : null}
              </Td>
              <Td className="break-all text-fg-muted">{user.email ?? '—'}</Td>
              <Td>
                {user.role === 'user' ? (
                  <span className="text-fg-muted">Advertiser</span>
                ) : (
                  <Badge tone="featured">{user.role === 'admin' ? 'Admin' : 'Moderator'}</Badge>
                )}
              </Td>
              <Td className="tabular-nums text-fg-muted">
                {user.adCount}
                {user.liveAdCount > 0 ? (
                  <span className="block text-xs text-fg-subtle">{user.liveAdCount} live</span>
                ) : null}
              </Td>
              <Td className="whitespace-nowrap text-fg-muted">{formatDate(user.createdAt)}</Td>
              <Td>
                {user.isBlocked ? <Badge tone="danger">Blocked</Badge> : <Badge>Active</Badge>}
              </Td>
              <Td>
                {user.id === currentUserId ? (
                  <span className="text-xs text-fg-subtle">—</span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTarget(user);
                      setError(null);
                    }}
                  >
                    {user.isBlocked ? 'Unblock' : 'Block'}
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </AdminTable>
      </div>

      <AdminDialog
        open={target !== null}
        title={target?.isBlocked ? 'Unblock this account?' : 'Block this account?'}
        description={
          target?.isBlocked
            ? `${target?.name} will be able to sign in and submit advertisements again.`
            : `${target?.name} will not be able to submit anything new. Advertisements already running stay where they are — take those down individually if that is what you mean.`
        }
        confirmLabel={target?.isBlocked ? 'Unblock' : 'Block'}
        tone={target?.isBlocked ? 'primary' : 'critical'}
        busy={busy}
        error={error}
        onConfirm={() => void confirm()}
        onClose={() => {
          if (!busy) {
            setTarget(null);
            setError(null);
          }
        }}
      />
    </>
  );
}
