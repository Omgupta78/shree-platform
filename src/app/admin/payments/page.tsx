import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminEmpty, AdminPageHeader, AdminPagination, AdminPanel, AdminTable, Td, Th } from '@/components/admin/admin-ui';
import {
  PaymentStatusBadge,
  paymentPurposeLabel,
} from '@/components/payments/payment-status';
import { getAdminPayments, type PaymentFilters } from '@/lib/data/payments';
import { razorpayConfig } from '@/lib/payments/config';
import { getPackageConfigs } from '@/lib/data/packages';
import { formatDate, formatPaise } from '@/lib/format';
import type { RawSearchParams } from '@/lib/admin/query';
import type { PaymentPurpose, PaymentStatus } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Payments' };

const PAGE_SIZE = 50;

const STATUSES: ReadonlyArray<{ value: PaymentStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'paid', label: 'Paid' },
  { value: 'created', label: 'Awaiting payment' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
];

const PURPOSES: ReadonlyArray<{ value: PaymentPurpose | 'all'; label: string }> = [
  { value: 'all', label: 'Both' },
  { value: 'new_advertisement', label: 'New advertisements' },
  { value: 'renewal', label: 'Renewals' },
];

/**
 * The office's ledger.
 *
 * Read-only, and that is a decision rather than an omission. There is no
 * "mark as paid" on this page: a payment's status comes from a verified
 * settlement — Razorpay's signature, checked against the account secret — and
 * a button here would be a way to make the ledger say something that did not
 * happen. Where money genuinely arrives another way, the correction belongs
 * with whoever can reconcile it against a bank statement, not with whoever
 * happens to be working the queue.
 *
 * Everything on this page comes from `admin_payments`, which returns nothing
 * at all unless `is_staff()`. The settlement signature is not in that view.
 */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;

  const status = pick(params.status, STATUSES);
  const purpose = pick(params.purpose, PURPOSES);
  const packageId = single(params.package);
  const from = single(params.from);
  const to = single(params.to);
  const query = single(params.q);
  const page = Math.max(1, Number(single(params.page) ?? '1') || 1);

  const filters: PaymentFilters = {
    status: status === 'all' ? null : status,
    purpose: purpose === 'all' ? null : purpose,
    packageId,
    from,
    // A date filter reads as "up to and including that day", so the upper
    // bound runs to the end of it rather than to midnight at its start.
    to: to ? `${to}T23:59:59.999Z` : null,
    query,
  };

  const [{ rows, total, collectedPaise }, packages] = await Promise.all([
    getAdminPayments(filters, { index: page - 1, size: PAGE_SIZE }),
    getPackageConfigs(),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const provider = razorpayConfig();

  return (
    <>
      <AdminPageHeader
        title="Payments"
        description="Every payment raised, and what became of it. Status comes from a verified settlement and cannot be set by hand."
        count={total}
      />

      {/*
        Which set of keys the site is running on, said out loud.

        Razorpay issues test keys as `rzp_test_…`, and a test-mode payment
        looks exactly like a real one on this page — same amount, same status,
        same reference. An office reconciling a month's takings against a bank
        statement that has none of them in it deserves to have been told, and
        the only moment to tell them is while they are looking at the figures.
      */}
      {provider === null ? (
        <p className="mb-4 rounded-sm border border-line bg-surface-sunken p-3 text-sm text-fg-muted">
          Online payment is not configured, so no new payments can be taken. Advertisements still
          reach the office; nothing is collected.
        </p>
      ) : provider.isTestMode ? (
        <p className="mb-4 rounded-sm border border-accent-line bg-accent-surface p-3 text-sm font-medium text-accent-fg">
          Razorpay is in TEST mode. Payments listed here were not real, and no money has reached the
          bank.
        </p>
      ) : null}

      <form method="get" className="mb-4 grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Search">
          <input
            type="search"
            name="q"
            defaultValue={query ?? ''}
            placeholder="Reference, title or payment id"
            className="h-9 w-full rounded-sm border border-line bg-surface px-2 text-sm"
          />
        </Field>

        <Field label="Status">
          <select
            name="status"
            defaultValue={status}
            className="h-9 w-full rounded-sm border border-line bg-surface px-2 text-sm"
          >
            {STATUSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Type">
          <select
            name="purpose"
            defaultValue={purpose}
            className="h-9 w-full rounded-sm border border-line bg-surface px-2 text-sm"
          >
            {PURPOSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Package">
          <select
            name="package"
            defaultValue={packageId ?? ''}
            className="h-9 w-full rounded-sm border border-line bg-surface px-2 text-sm"
          >
            <option value="">Any</option>
            {packages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="From">
          <input
            type="date"
            name="from"
            defaultValue={from ?? ''}
            className="h-9 w-full rounded-sm border border-line bg-surface px-2 text-sm"
          />
        </Field>

        <Field label="To">
          <input
            type="date"
            name="to"
            defaultValue={to ?? ''}
            className="h-9 w-full rounded-sm border border-line bg-surface px-2 text-sm"
          />
        </Field>

        <div className="flex items-end gap-2 sm:col-span-2">
          <button
            type="submit"
            className="h-9 rounded-sm bg-primary-solid px-4 text-sm font-medium text-primary-fg hover:bg-primary-solid-hover"
          >
            Apply
          </button>
          <Link
            href="/admin/payments"
            className="h-9 rounded-sm border border-line-strong px-4 text-sm leading-9 font-medium hover:bg-surface-sunken"
          >
            Clear
          </Link>
        </div>
      </form>

      <p className="mb-4 text-sm text-fg-muted">
        Settled on this page:{' '}
        <strong className="font-serif text-base font-semibold tabular-nums">
          {formatPaise(collectedPaise)}
        </strong>
        {pageCount > 1 ? <span className="text-fg-subtle"> — this page only, of {total}</span> : null}
      </p>

      <AdminPanel>
        {rows.length === 0 ? (
          <AdminEmpty
            title="No payments match"
            description="Nothing has been raised against these filters."
          />
        ) : (
          <>
            <AdminTable
              caption="Payments"
              head={
                <>
                  <Th>Reference</Th>
                  <Th>Advertisement</Th>
                  <Th>Advertiser</Th>
                  <Th>Package</Th>
                  <Th>Type</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                </>
              }
            >
              {rows.map((row) => (
                <tr key={row.id} data-payment={row.id} className="hover:bg-surface-sunken">
                  <Td className="tabular-nums whitespace-nowrap">{row.ad_reference}</Td>
                  <Td className="max-w-[16rem]">
                    <Link
                      href={`/admin/advertisements/${row.ad_id}`}
                      className="line-clamp-2 font-medium hover:text-primary"
                    >
                      {row.ad_title}
                    </Link>
                  </Td>
                  <Td className="max-w-[14rem]">
                    <span className="block truncate">{row.user_name ?? '—'}</span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {row.user_email ?? ''}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">{row.package_name ?? row.package_id}</Td>
                  <Td className="whitespace-nowrap">{paymentPurposeLabel(row.purpose)}</Td>
                  <Td className="text-right tabular-nums whitespace-nowrap">
                    {formatPaise(row.amount_paise)}
                  </Td>
                  <Td>
                    <PaymentStatusBadge status={row.status} />
                    {row.failure_reason ? (
                      <span className="mt-1 block max-w-[12rem] text-xs text-fg-subtle">
                        {row.failure_reason}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(row.paid_at ?? row.created_at)}
                  </Td>
                </tr>
              ))}
            </AdminTable>

            <AdminPagination
              page={page}
              pageCount={pageCount}
              hrefFor={(next) => hrefWithPage(params, next)}
            />
          </>
        )}
      </AdminPanel>
    </>
  );
}

/* ------------------------------------------------------------- helpers -- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function single(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function pick<T extends string>(
  value: string | string[] | undefined,
  options: ReadonlyArray<{ value: T }>,
): T {
  const raw = single(value);
  return options.find((item) => item.value === raw)?.value ?? (options[0] as { value: T }).value;
}

function hrefWithPage(params: RawSearchParams, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page' || value === undefined) continue;
    search.set(key, Array.isArray(value) ? (value[0] ?? '') : value);
  }
  search.set('page', String(page));
  return `/admin/payments?${search.toString()}`;
}
