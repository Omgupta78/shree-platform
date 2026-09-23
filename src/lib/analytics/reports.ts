import 'server-only';

import {
  getCategoryAnalytics,
  getDashboardMetrics,
  getLocationAnalytics,
  getModerators,
  getRenewalAnalytics,
  getRevenueByPackage,
  getSearchAnalytics,
  getTopAdvertisements,
  getUserFunnel,
  approvalRate,
  paymentSuccessRate,
  renewalRate,
} from '@/lib/analytics/queries';
import type { DateRange } from '@/lib/analytics/range';
import type { ReportColumn, ReportRow } from '@/lib/analytics/report-view';

/**
 * The reports, defined once.
 *
 * The page and the CSV export read the same definitions, which is the point of
 * this file: a column that appears on screen and a column that appears in the
 * download cannot drift apart, and a report that is an administrator's on the
 * page cannot quietly be a moderator's in the export. `adminOnly` is checked
 * in both places, and underneath both the database refuses the query anyway.
 *
 * Every cell is a raw value — a number of paise, an integer, an ISO instant —
 * and the column says how to show it. Formatting happens at the edge, once, in
 * the two places that display things. Nothing downstream has to parse "₹1,234"
 * back into a number, and the CSV carries figures a spreadsheet can add up.
 */

export type { CellKind, ReportColumn, ReportRow } from '@/lib/analytics/report-view';

export type ReportId =
  | 'revenue'
  | 'categories'
  | 'locations'
  | 'moderation'
  | 'renewals'
  | 'searches'
  | 'top-ads'
  | 'people';

export interface ReportDefinition {
  id: ReportId;
  label: string;
  /** One sentence, shown under the title, saying what is being counted. */
  description: string;
  /** Money or account figures. Refused to a moderator in the database too. */
  adminOnly: boolean;
  columns: ReportColumn[];
  /** Which column the report opens sorted by, largest first. */
  defaultSort: string;
  /** A note under the table where a figure needs one to be read correctly. */
  caveat?: string;
  load: (range: DateRange) => Promise<ReportRow[] | null>;
}

/* ------------------------------------------------------------ the reports -- */

export const REPORTS: readonly ReportDefinition[] = [
  {
    id: 'revenue',
    label: 'Revenue by package',
    description:
      'Settled payments in the period, grouped by what was bought. Attempts that failed or were abandoned are not counted.',
    adminOnly: true,
    defaultSort: 'revenue',
    columns: [
      { key: 'package', label: 'Package', kind: 'text' },
      { key: 'purchases', label: 'Purchases', kind: 'number' },
      { key: 'revenue', label: 'Revenue', kind: 'money' },
      { key: 'average', label: 'Average', kind: 'money' },
    ],
    async load(range) {
      const rows = await getRevenueByPackage(range);
      if (rows === null) return null;
      return rows.map((r) => ({
        key: r.packageId,
        cells: {
          package: r.packageName,
          purchases: r.purchases,
          revenue: r.revenuePaise,
          average: r.averagePaise,
        },
      }));
    },
  },
  {
    id: 'categories',
    label: 'Categories',
    description:
      'Advertisements submitted in the period by category, with the revenue they carried and how many of that category are live now.',
    adminOnly: true,
    defaultSort: 'submitted',
    caveat:
      '“Live now” is a fact about this moment rather than about the period, so it does not add up across periods.',
    columns: [
      { key: 'category', label: 'Category', kind: 'text' },
      { key: 'submitted', label: 'Submitted', kind: 'number' },
      { key: 'live', label: 'Live now', kind: 'number' },
      { key: 'revenue', label: 'Revenue', kind: 'money' },
    ],
    async load(range) {
      const rows = await getCategoryAnalytics(range);
      if (rows === null) return null;
      return rows.map((r) => ({
        key: r.categoryId,
        cells: {
          category: r.categoryName,
          submitted: r.adsCreated,
          live: r.adsLive,
          revenue: r.revenuePaise,
        },
      }));
    },
  },
  {
    id: 'locations',
    label: 'Places',
    description: 'Advertisements submitted in the period, by the place they were posted for.',
    adminOnly: false,
    defaultSort: 'submitted',
    caveat:
      'There is no revenue column here. A payment is attached to an advertisement rather than to a town, and attributing it through the advertisement would credit a package bought before the place was chosen.',
    columns: [
      { key: 'place', label: 'Place', kind: 'text' },
      { key: 'kind', label: 'Kind', kind: 'text' },
      { key: 'submitted', label: 'Submitted', kind: 'number' },
      { key: 'live', label: 'Live now', kind: 'number' },
    ],
    async load(range) {
      const rows = await getLocationAnalytics(range);
      if (rows === null) return null;
      return rows.map((r) => ({
        key: r.locationId,
        cells: {
          place: r.locationName,
          kind: r.locationKind,
          submitted: r.adsCreated,
          live: r.adsLive,
        },
      }));
    },
  },
  {
    id: 'moderation',
    label: 'Moderation',
    description: 'Decisions made in the period, by whoever made them.',
    adminOnly: false,
    defaultSort: 'decisions',
    caveat:
      'A decision counts against the person who made it, on the day they made it — not against the day the advertisement arrived.',
    columns: [
      { key: 'moderator', label: 'Moderator', kind: 'text' },
      { key: 'decisions', label: 'Decisions', kind: 'number' },
      { key: 'approved', label: 'Approved', kind: 'number' },
      { key: 'rejected', label: 'Rejected', kind: 'number' },
      { key: 'share', label: 'Approved share', kind: 'percent' },
    ],
    async load(range) {
      const rows = await getModerators(range);
      if (rows === null) return null;
      return rows.map((r) => ({
        key: r.moderatorId,
        cells: {
          moderator: r.moderatorName,
          decisions: r.decisions,
          approved: r.approved,
          rejected: r.rejected,
          // Null rather than 0 when nobody decided anything: a moderator with
          // no decisions has no approval rate, not a rate of nought.
          share: r.decisions === 0 ? null : r.approved / r.decisions,
        },
      }));
    },
  },
  {
    id: 'renewals',
    label: 'Renewals',
    description: 'Renewal requests made in the period, and what became of them.',
    adminOnly: false,
    defaultSort: 'value',
    caveat:
      'The renewal rate divides by the advertisements whose run ENDED in the period, not by every advertisement on the site.',
    columns: [
      { key: 'measure', label: 'Measure', kind: 'text' },
      { key: 'value', label: 'Figure', kind: 'number' },
    ],
    async load(range) {
      const [summary, overview] = await Promise.all([
        getRenewalAnalytics(range),
        getDashboardMetrics(range),
      ]);
      if (summary === null) return null;

      const rows: ReportRow[] = [
        row('requested', 'Requested', summary.requested),
        row('approved', 'Approved', summary.approved),
        row('rejected', 'Rejected', summary.rejected),
        row('pending', 'Still waiting', summary.stillPending),
        row('early', 'Asked before expiry', summary.renewedEarly),
        row('late', 'Asked after expiry', summary.renewedLate),
        row('paid', 'Paid for', summary.paidRenewals),
        row('expiring', 'Expiring within 7 days', summary.expiringSoon),
      ];

      // Only an administrator gets the overview back, so the rate is present
      // for them and simply absent for a moderator rather than wrong.
      if (overview) {
        rows.push(row('eligible', 'Advertisements whose run ended', overview.adsBecameEligible));
      }
      return rows;
    },
  },
  {
    id: 'searches',
    label: 'Search terms',
    description:
      'What people typed into the search box, with no searcher attached. Terms of one character are not recorded.',
    adminOnly: false,
    defaultSort: 'searches',
    caveat:
      '“Found nothing” is the column worth reading: it is somebody asking for something the site does not carry.',
    columns: [
      { key: 'term', label: 'Term', kind: 'text' },
      { key: 'searches', label: 'Searches', kind: 'number' },
      { key: 'empty', label: 'Found nothing', kind: 'number' },
      { key: 'last', label: 'Last searched', kind: 'date' },
    ],
    async load(range) {
      const rows = await getSearchAnalytics(range, 500);
      if (rows === null) return null;
      return rows.map((r) => ({
        key: r.term,
        cells: { term: r.term, searches: r.searches, empty: r.zeroResult, last: r.lastSeen },
      }));
    },
  },
  {
    id: 'top-ads',
    label: 'Most read advertisements',
    description: 'Advertisements published in the period, ordered by the views they have had.',
    adminOnly: false,
    defaultSort: 'views',
    caveat:
      'Views are a running total kept on each advertisement since it was published, not a count for the chosen period — nothing records the date of an individual view. “Saved” is how many readers have it saved right now.',
    columns: [
      { key: 'title', label: 'Advertisement', kind: 'text' },
      { key: 'reference', label: 'Reference', kind: 'text' },
      { key: 'category', label: 'Category', kind: 'text' },
      { key: 'views', label: 'Views', kind: 'number' },
      { key: 'saved', label: 'Saved', kind: 'number' },
      { key: 'status', label: 'Status', kind: 'text' },
      { key: 'published', label: 'Published', kind: 'date' },
    ],
    async load(range) {
      const rows = await getTopAdvertisements(range, 50);
      if (rows === null) return null;
      return rows.map((r) => ({
        key: r.adId,
        href: `/admin/advertisements/${r.adId}`,
        cells: {
          title: r.title,
          reference: r.reference,
          category: r.category,
          views: r.views,
          saved: r.favourites,
          status: r.status,
          published: r.publishedAt,
        },
      }));
    },
  },
  {
    id: 'people',
    label: 'People and advertisements',
    description:
      'The headline counts for the period, and how many distinct people did each thing in it.',
    adminOnly: true,
    defaultSort: 'value',
    caveat:
      'The five “people who…” figures each count the distinct people who did that thing during the period. They are not one group followed from step to step, so they must not be divided into one another to make a conversion rate.',
    columns: [
      { key: 'measure', label: 'Measure', kind: 'text' },
      { key: 'value', label: 'Figure', kind: 'number' },
    ],
    async load(range) {
      const [overview, funnel] = await Promise.all([
        getDashboardMetrics(range),
        getUserFunnel(range),
      ]);
      if (overview === null) return null;

      const rows: ReportRow[] = [
        row('users_new', 'Accounts opened', overview.usersNew),
        row('users_total', 'Accounts in total', overview.usersTotal),
        row('ads_created', 'Advertisements submitted', overview.adsCreated),
        row('ads_live', 'Live now', overview.adsLive),
        row('ads_pending', 'Waiting for review now', overview.adsPending),
        row('ads_expired', 'Runs that ended', overview.adsExpired),
        row('payments_paid', 'Payments settled', overview.paymentsPaid),
        row('payments_attempted', 'Payments attempted', overview.paymentsAttempted),
      ];

      if (funnel) {
        rows.push(
          row('p_registered', 'People who registered', funnel.registered),
          row('p_posted', 'People who posted', funnel.posted),
          row('p_paid', 'People who paid', funnel.paid),
          row('p_published', 'People who had one published', funnel.published),
          row('p_renewed', 'People who asked to renew', funnel.renewed),
        );
      }
      return rows;
    },
  },
];

function row(key: string, measure: string, value: number): ReportRow {
  return { key, cells: { measure, value } };
}

export function findReport(id: string | null | undefined): ReportDefinition {
  return REPORTS.find((r) => r.id === id) ?? (REPORTS[1] as ReportDefinition);
}

/** Which reports a person may choose from. The database refuses the rest anyway. */
export function reportsFor(isAdmin: boolean): readonly ReportDefinition[] {
  return isAdmin ? REPORTS : REPORTS.filter((r) => !r.adminOnly);
}

/* ------------------------------------------------------- the rates, apart -- */

/**
 * The three rates, for the summary line above a report.
 *
 * Kept out of the tables on purpose: a rate is not a row, and a spreadsheet
 * that sums a column of percentages produces a number that means nothing.
 */
export async function reportRates(range: DateRange) {
  const overview = await getDashboardMetrics(range);
  if (!overview) return null;
  return {
    approval: approvalRate(overview),
    renewal: renewalRate(overview),
    payment: paymentSuccessRate(overview),
  };
}
