import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminEmpty, AdminPageHeader, AdminPanel, AdminTable, Td, Th } from '@/components/admin/admin-ui';
import { BarChart } from '@/components/analytics/bar-chart';
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { AnalyticsEmpty, AnalyticsUntracked } from '@/components/analytics/empty';
import { FunnelPanel } from '@/components/analytics/funnel';
import { KpiCard } from '@/components/analytics/kpi-card';
import { LineChart } from '@/components/analytics/line-chart';
import { Button } from '@/components/ui/button';
import { getStaffMember } from '@/lib/admin/guard';
import type { RawSearchParams } from '@/lib/admin/query';
import {
  approvalRate,
  formatRate,
  getCategoryAnalytics,
  getDashboardMetrics,
  getLocationAnalytics,
  getModerationAnalytics,
  getModerators,
  getRenewalAnalytics,
  getRevenueByPackage,
  getSearchAnalytics,
  getTimeseries,
  getTopAdvertisements,
  getUserFunnel,
  paymentSuccessRate,
  renewalRate,
} from '@/lib/analytics/queries';
import {
  REPORTING_TIME_ZONE,
  describeRange as describe,
  previousRange,
  rangeParams,
  resolveRange,
  type DateRange,
} from '@/lib/analytics/range';
import { formatDate, formatPaise, formatPaiseAsRupees } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Analytics' };

/**
 * The figures.
 *
 * Three rules govern every panel on this page, and they are the reason it is
 * shorter than a dashboard of this kind usually is.
 *
 * ONE. Nothing here is invented. Every number is counted by one SQL function
 * against real rows. There is no sample data, no seeded trend and no
 * projection. Where a thing is not measured — a tap on a telephone number, a
 * WhatsApp click, views inside a chosen period — the panel says it is not
 * measured rather than drawing a plausible line.
 *
 * TWO. A figure that could not be read is not a zero. Each query returns null
 * when it fails or is refused, and a panel with null says it has no data. This
 * matters most for a moderator, who is refused revenue in the database: the
 * alternative would put ₹0 on the screen as though somebody had counted it.
 *
 * THREE. The split between what a moderator sees and what an administrator
 * sees is enforced in Postgres, by `require_revenue_reader()`. Everything
 * below simply declines to render panels that would be refused anyway, so a
 * moderator is not shown eight empty boxes. Hiding them is courtesy; the
 * refusal is the security.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const range = resolveRange({
    preset: single(params.range),
    from: single(params.from),
    to: single(params.to),
  });

  // The layout has already refused anyone who is not staff; this decides which
  // half of the page they are shown.
  const staff = await getStaffMember();
  const isAdmin = staff?.role === 'admin';

  return (
    <>
      <AdminPageHeader
        title="Analytics"
        description="Counted from the advertisements, payments and decisions themselves. Nothing on this page is estimated."
        actions={
          <Button href={`/admin/analytics/reports?${new URLSearchParams(rangeParams(range))}`} variant="secondary" size="sm">
            Detailed reports
          </Button>
        }
      />

      <DateRangePicker range={range} />

      <div className="mt-6 space-y-6">
        {isAdmin ? <BusinessSection range={range} /> : <ModeratorNotice />}
        <QueueSection range={range} />
        <ReadershipSection range={range} isAdmin={isAdmin} />
        {isAdmin ? <PeopleSection range={range} /> : null}
      </div>
    </>
  );
}

/* --------------------------------------------------------- the business -- */

async function BusinessSection({ range }: { range: DateRange }) {
  // The same measures over the preceding period of equal length, so "up 12%"
  // is a comparison of two counted things rather than a figure of speech. Only
  // the bounds are used, but the whole shape is built so nothing downstream
  // reads a label that describes a different period.
  const previous = previousRange(range);
  const earlier: DateRange = {
    ...range,
    from: previous.from,
    to: previous.to,
    label: describe(previous.from, previous.to),
  };

  const [overview, before, series, packages, categories] = await Promise.all([
    getDashboardMetrics(range),
    getDashboardMetrics(earlier),
    getTimeseries(range),
    getRevenueByPackage(range),
    getCategoryAnalytics(range),
  ]);

  if (!overview) {
    return (
      <AdminPanel title="Business">
        <div className="p-4">
          <AnalyticsEmpty message="The business figures could not be read." />
        </div>
      </AdminPanel>
    );
  }

  const periodLabel = 'the period before';
  const delta = (current: number, prev: number | undefined) =>
    before === null || prev === undefined ? null : { current, previous: prev, periodLabel };

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue"
          value={formatPaise(overview.revenuePaise)}
          delta={delta(overview.revenuePaise, before?.revenuePaise)}
          hint="Settled payments only, by the date the money was taken. Attempts that failed are not in it."
        />
        <KpiCard
          label="Payments taken"
          value={overview.paymentsPaid.toLocaleString('en-IN')}
          delta={delta(overview.paymentsPaid, before?.paymentsPaid)}
          hint={`${overview.paymentsAttempted.toLocaleString('en-IN')} attempted · ${formatRate(paymentSuccessRate(overview))} completed`}
        />
        <KpiCard
          label="Average payment"
          value={overview.averageValuePaise === null ? null : formatPaise(overview.averageValuePaise)}
          hint={
            overview.averageValuePaise === null
              ? 'No payment settled in this period, so there is no average.'
              : 'Total settled divided by the number of settled payments.'
          }
        />
        <KpiCard
          label="Refunded"
          value={formatPaise(overview.refundedPaise)}
          hint="Payments marked refunded in this period. Refunds are recorded by hand; the site never issues one."
        />
      </div>

      <AdminPanel
        title="Revenue and volume over time"
        description={range.grain === 'month' ? 'By month.' : 'By day, in the office’s own day.'}
      >
        <div className="p-4">
          {series === null ? (
            <AnalyticsEmpty message="The series could not be read." />
          ) : (
            <LineChart
              points={series.map((p) => ({
                bucket: p.bucket,
                values: [p.revenuePaise, p.paymentsPaid],
              }))}
              series={[
                { label: 'Revenue', format: (v) => formatPaiseAsRupees(v) },
                { label: 'Payments taken', format: (v) => v.toLocaleString('en-IN') },
              ]}
              labelFor={bucketLabel(range)}
            />
          )}
        </div>
      </AdminPanel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AdminPanel title="Revenue by package" description="Settled payments, grouped by what was bought.">
          <div className="p-4">
            {packages === null ? (
              <AnalyticsEmpty message="Revenue by package could not be read." />
            ) : (
              <BarChart
                data={packages.map((p) => ({
                  key: p.packageId,
                  label: p.packageName,
                  value: p.revenuePaise,
                  note: `${p.purchases.toLocaleString('en-IN')} purchased · ${formatPaise(p.averagePaise)} each on average`,
                }))}
                format={(v) => formatPaise(v)}
                emptyMessage="No package was paid for in this period."
              />
            )}
          </div>
        </AdminPanel>

        <AdminPanel
          title="Revenue by category"
          description="Which kinds of advertisement the money came from."
        >
          <div className="p-4">
            {categories === null ? (
              <AnalyticsEmpty message="Category revenue could not be read." />
            ) : (
              <BarChart
                data={categories
                  .filter((c) => c.revenuePaise > 0)
                  .map((c) => ({
                    key: c.categoryId,
                    label: c.categoryName,
                    value: c.revenuePaise,
                    note: `${c.adsCreated.toLocaleString('en-IN')} submitted · ${c.adsLive.toLocaleString('en-IN')} live now`,
                  }))}
                format={(v) => formatPaise(v)}
                emptyMessage="No category produced revenue in this period."
              />
            )}
          </div>
        </AdminPanel>
      </div>
    </section>
  );
}

function ModeratorNotice() {
  return (
    <AdminPanel title="Business figures">
      <div className="p-4">
        <p className="text-sm text-fg-muted">
          Revenue, payments and account figures are the administrator&rsquo;s. The queue and
          readership figures below are yours.
        </p>
      </div>
    </AdminPanel>
  );
}

/* ------------------------------------------------------------- the queue -- */

async function QueueSection({ range }: { range: DateRange }) {
  const [moderation, moderators, renewals, overview] = await Promise.all([
    getModerationAnalytics(range),
    getModerators(range),
    getRenewalAnalytics(range),
    // Refused for a moderator, and that is fine: the rates below are then
    // simply not drawn rather than drawn wrong.
    getDashboardMetrics(range),
  ]);

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Decisions made"
          value={moderation === null ? null : moderation.decidedTotal.toLocaleString('en-IN')}
          hint={
            moderation === null
              ? undefined
              : `${moderation.approved} approved · ${moderation.rejected} rejected · ${moderation.changesRequested} sent back`
          }
        />
        <KpiCard
          label="Approval rate"
          value={overview === null ? null : formatRate(approvalRate(overview))}
          hint="Approved, divided by the decisions actually made in this period. Advertisements still waiting are not in the denominator."
        />
        <KpiCard
          label="Median wait before a decision"
          value={
            moderation === null || moderation.medianHours === null
              ? null
              : hours(moderation.medianHours)
          }
          hint={
            moderation === null || moderation.averageHours === null
              ? 'Nothing was decided in this period.'
              : `Mean ${hours(moderation.averageHours)}. The median is the one to read: a single advertisement left over a holiday drags the mean and not the middle.`
          }
        />
        <KpiCard
          label="Waiting now"
          value={moderation === null ? null : moderation.awaitingReview.toLocaleString('en-IN')}
          hint="Pending this moment, not during the period — a queue length is a fact about now."
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AdminPanel title="Who decided what" description="Decisions made in this period.">
          {moderators === null ? (
            <div className="p-4">
              <AnalyticsEmpty message="The moderators&rsquo; figures could not be read." />
            </div>
          ) : moderators.length === 0 ? (
            <AdminEmpty title="No decisions in this period" />
          ) : (
            <AdminTable
              caption="Decisions by moderator"
              head={
                <>
                  <Th>Moderator</Th>
                  <Th className="text-right">Decisions</Th>
                  <Th className="text-right">Approved</Th>
                  <Th className="text-right">Rejected</Th>
                </>
              }
            >
              {moderators.map((m) => (
                <tr key={m.moderatorId}>
                  <Td>{m.moderatorName}</Td>
                  <Td className="text-right tabular-nums">{m.decisions}</Td>
                  <Td className="text-right tabular-nums">{m.approved}</Td>
                  <Td className="text-right tabular-nums">{m.rejected}</Td>
                </tr>
              ))}
            </AdminTable>
          )}
        </AdminPanel>

        <AdminPanel title="Renewals" description="Requests made in this period.">
          <div className="p-4">
            {renewals === null ? (
              <AnalyticsEmpty message="Renewal figures could not be read." />
            ) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Stat label="Requested" value={renewals.requested} />
                <Stat label="Approved" value={renewals.approved} />
                <Stat label="Rejected" value={renewals.rejected} />
                <Stat label="Still waiting" value={renewals.stillPending} />
                <Stat label="Asked before expiry" value={renewals.renewedEarly} />
                <Stat label="Asked after expiry" value={renewals.renewedLate} />
                <Stat label="Paid for" value={renewals.paidRenewals} />
                <Stat label="Expiring in 7 days" value={renewals.expiringSoon} />
              </dl>
            )}
            {overview === null ? null : (
              <p className="mt-4 border-t border-line pt-3 text-sm">
                <span className="font-medium">{formatRate(renewalRate(overview))}</span>{' '}
                <span className="text-fg-muted">
                  of the advertisements whose run ended in this period were put up for renewal.
                  The denominator is advertisements that reached the end of a run, not every
                  advertisement on the site.
                </span>
              </p>
            )}
          </div>
        </AdminPanel>
      </div>
    </section>
  );
}

/* -------------------------------------------------------- the readership -- */

async function ReadershipSection({ range, isAdmin }: { range: DateRange; isAdmin: boolean }) {
  const [topAds, searches, locations] = await Promise.all([
    getTopAdvertisements(range),
    getSearchAnalytics(range),
    getLocationAnalytics(range),
  ]);

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AdminPanel
          title="Most read advertisements"
          description="Published in this period, ordered by the views they have had since."
        >
          {topAds === null ? (
            <div className="p-4">
              <AnalyticsEmpty message="The readership figures could not be read." />
            </div>
          ) : topAds.length === 0 ? (
            <AdminEmpty title="Nothing was published in this period" />
          ) : (
            <>
              <AdminTable
                caption="Most read advertisements"
                head={
                  <>
                    <Th>Advertisement</Th>
                    <Th className="text-right">Views</Th>
                    <Th className="text-right">Saved</Th>
                    <Th>Published</Th>
                  </>
                }
              >
                {topAds.map((ad) => (
                  <tr key={ad.adId}>
                    <Td>
                      <Link
                        href={`/admin/advertisements/${ad.adId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {ad.title}
                      </Link>
                      <p className="text-xs text-fg-subtle">
                        {ad.reference}
                        {ad.category ? ` · ${ad.category}` : ''}
                      </p>
                    </Td>
                    <Td className="text-right tabular-nums">{ad.views.toLocaleString('en-IN')}</Td>
                    <Td className="text-right tabular-nums">
                      {ad.favourites.toLocaleString('en-IN')}
                    </Td>
                    <Td>{formatDate(ad.publishedAt)}</Td>
                  </tr>
                ))}
              </AdminTable>
              <p className="border-t border-line px-4 py-3 text-xs text-fg-subtle">
                Views are a running total kept on each advertisement since it was published, not a
                count for the chosen period — nothing records the date of an individual view.
                &ldquo;Saved&rdquo; is how many readers have it saved right now; unsaving removes
                the record.
              </p>
            </>
          )}
        </AdminPanel>

        <AdminPanel title="What people searched for" description="Search terms, with no searcher attached.">
          {searches === null ? (
            <div className="p-4">
              <AnalyticsEmpty message="The search log could not be read." />
            </div>
          ) : searches.length === 0 ? (
            <AdminEmpty
              title="No searches recorded in this period"
              description="Searches are recorded without any identifier, and only from the classifieds page."
            />
          ) : (
            <>
              <AdminTable
                caption="Search terms"
                head={
                  <>
                    <Th>Term</Th>
                    <Th className="text-right">Searches</Th>
                    <Th className="text-right">Found nothing</Th>
                    <Th>Last seen</Th>
                  </>
                }
              >
                {searches.map((s) => (
                  <tr key={s.term}>
                    <Td>{s.term}</Td>
                    <Td className="text-right tabular-nums">{s.searches}</Td>
                    <Td className="text-right tabular-nums">{s.zeroResult}</Td>
                    <Td>{formatDate(s.lastSeen)}</Td>
                  </tr>
                ))}
              </AdminTable>
              <p className="border-t border-line px-4 py-3 text-xs text-fg-subtle">
                A term that often finds nothing is the useful column: it is somebody asking for
                something the site does not carry.
              </p>
            </>
          )}
        </AdminPanel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AdminPanel title="Where the advertisements are" description="Submitted in this period, by place.">
          <div className="p-4">
            {locations === null ? (
              <AnalyticsEmpty message="The location figures could not be read." />
            ) : (
              <BarChart
                data={locations.map((l) => ({
                  key: l.locationId,
                  label: l.locationName,
                  value: l.adsCreated,
                  note: `${l.adsLive.toLocaleString('en-IN')} live now`,
                }))}
                format={(v) => v.toLocaleString('en-IN')}
                emptyMessage="No advertisement was submitted in this period."
              />
            )}
          </div>
        </AdminPanel>

        <AdminPanel title="What is not measured">
          <div className="space-y-3 p-4">
            <AnalyticsUntracked
              metric="Telephone and WhatsApp taps"
              reason="Nothing records a reader tapping an advertiser's number, so there is no figure for how many enquiries an advertisement produced. It would need an event written at the moment of the tap."
            />
            <AnalyticsUntracked
              metric="Views within a chosen period"
              reason="Each advertisement keeps one running total. Views per day would need a row written per view, which is a different table from the counter that exists."
            />
            {isAdmin ? (
              <AnalyticsUntracked
                metric="Revenue by place"
                reason="Payments are attached to an advertisement rather than to a town, and attributing them through the advertisement would count a package bought before the place was chosen. Revenue by category is above and is safe to read."
              />
            ) : null}
          </div>
        </AdminPanel>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- the people -- */

async function PeopleSection({ range }: { range: DateRange }) {
  const [funnel, overview, series] = await Promise.all([
    getUserFunnel(range),
    getDashboardMetrics(range),
    getTimeseries(range),
  ]);

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="New accounts"
          value={overview === null ? null : overview.usersNew.toLocaleString('en-IN')}
          hint={overview === null ? undefined : `${overview.usersTotal.toLocaleString('en-IN')} in total`}
        />
        <KpiCard
          label="Advertisements submitted"
          value={overview === null ? null : overview.adsCreated.toLocaleString('en-IN')}
          hint="Drafts are not counted; a draft has not been sent to anybody."
        />
        <KpiCard
          label="Live now"
          value={overview === null ? null : overview.adsLive.toLocaleString('en-IN')}
          hint="Published and not yet expired, this moment."
        />
        <KpiCard
          label="Expired"
          value={overview === null ? null : overview.adsExpired.toLocaleString('en-IN')}
          hint="Advertisements whose run ended during this period."
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AdminPanel title="Advertisements over time" description="Submitted against published.">
          <div className="p-4">
            {series === null ? (
              <AnalyticsEmpty message="The series could not be read." />
            ) : (
              <LineChart
                points={series.map((p) => ({
                  bucket: p.bucket,
                  values: [p.adsCreated, p.adsPublished],
                }))}
                series={[
                  { label: 'Submitted', format: (v) => v.toLocaleString('en-IN') },
                  { label: 'Published', format: (v) => v.toLocaleString('en-IN') },
                ]}
                labelFor={bucketLabel(range)}
              />
            )}
          </div>
        </AdminPanel>

        <AdminPanel title="What people did" description="Distinct people, per step, in this period.">
          <div className="p-4">
            {funnel === null ? (
              <AnalyticsEmpty message="The user figures could not be read." />
            ) : (
              <FunnelPanel funnel={funnel} />
            )}
          </div>
        </AdminPanel>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- odds -- */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value.toLocaleString('en-IN')}</dd>
    </div>
  );
}

/** "3 hr", "2 days" — the same vocabulary the queue pages use. */
function hours(value: number): string {
  if (value < 1) return 'under an hour';
  if (value < 24) return `${Math.round(value)} hr`;
  const days = Math.round(value / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

function bucketLabel(range: DateRange) {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: REPORTING_TIME_ZONE,
    ...(range.grain === 'month'
      ? { month: 'short', year: '2-digit' }
      : { day: 'numeric', month: 'short' }),
  });
  return (bucket: string) => {
    const date = new Date(bucket);
    return Number.isNaN(date.getTime()) ? bucket : formatter.format(date);
  };
}

function single(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
