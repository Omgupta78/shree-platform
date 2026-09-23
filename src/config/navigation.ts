/**
 * Navigation, defined once and consumed by the header, the mobile menu and
 * the footer so the three can never drift apart.
 */
export interface NavLink {
  href: string;
  label: string;
  /**
   * False for a page the site has been promised but does not yet have.
   *
   * The admin sidebar has carried this flag since Phase 7, for the reason
   * written above `ADMIN_NAV`: a navigation item that 404s teaches people to
   * distrust the whole menu. The public navigation was never given the same
   * treatment, and eight of its links — every one of them in the header and
   * footer of every page — answered 404.
   *
   * The entries stay here rather than being deleted, because they are what
   * the site is meant to have. Writing the page and setting this to true is
   * the whole of the work; nothing else has to be remembered.
   */
  built: boolean;
}

/** Every primary link, built or not. Rendered through `PRIMARY_NAV`. */
const ALL_PRIMARY_NAV: readonly NavLink[] = [
  { href: '/', label: 'Home', built: true },
  { href: '/classifieds', label: 'Classifieds', built: true },
  { href: '/categories', label: 'Categories', built: true },
  { href: '/edition', label: "Today's Edition", built: false },
  { href: '/advertise', label: 'Advertise With Us', built: true },
  { href: '/about', label: 'About', built: true },
  { href: '/contact', label: 'Contact', built: true },
] as const;

const ALL_LEGAL_NAV: readonly NavLink[] = [
  { href: '/privacy', label: 'Privacy Policy', built: false },
  { href: '/terms', label: 'Terms & Conditions', built: false },
  { href: '/disclaimer', label: 'Disclaimer', built: false },
  { href: '/report', label: 'Report an Advertisement', built: false },
] as const;

/*
 * What the header, the mobile menu and the footer actually render.
 *
 * The filtering happens HERE, once, rather than in each of the three
 * consumers: they keep reading `PRIMARY_NAV` exactly as before, and there is
 * no filter for a fourth consumer to forget. An unbuilt link is not dimmed
 * the way the admin sidebar dims one — a reader is not staff and has no use
 * for knowing what the office has not finished.
 */
export const PRIMARY_NAV: readonly NavLink[] = ALL_PRIMARY_NAV.filter((link) => link.built);
export const LEGAL_NAV: readonly NavLink[] = ALL_LEGAL_NAV.filter((link) => link.built);

/** The full lists, for tests that check every promised page is accounted for. */
export const PLANNED_NAV: readonly NavLink[] = [...ALL_PRIMARY_NAV, ...ALL_LEGAL_NAV];

/**
 * Whether a promised page exists yet.
 *
 * Exported so that a section of a page which exists only to send people to an
 * unbuilt route is governed by the same flag as the link in the menu. The home
 * page's edition panel is the case this was added for: it was still rendering,
 * with placeholder editions and two buttons to `/edition`, long after anyone
 * would have noticed a broken menu item.
 */
export function isPageBuilt(href: string): boolean {
  return PLANNED_NAV.find((link) => link.href === href)?.built ?? false;
}

/** The account actions that sit apart from the navigation proper. */
export const ACCOUNT_ACTIONS = {
  post: { href: '/post-ad', label: 'Post an Advertisement' },
  signIn: { href: '/sign-in', label: 'Sign in' },
  signUp: { href: '/sign-up', label: 'Create an account' },
  myAds: { href: '/my-ads', label: 'My Advertisements' },
} as const;

/**
 * Routes that need a signed-in visitor.
 *
 * Read by `src/proxy.ts`, which does the redirecting, and by nothing else.
 * Keeping the list here rather than inline in the proxy means a new protected
 * page is one line, in the file where the rest of the routing lives.
 */
export const PROTECTED_PREFIXES = ['/my-ads', '/dashboard', '/account', '/admin'] as const;

/**
 * The prefixes that need a staff role, not merely a session.
 *
 * A separate list because the proxy pays for a role lookup only on these, and
 * because "signed in" and "allowed in the office" are different questions that
 * should not share a variable.
 */
export const STAFF_PREFIXES = ['/admin'] as const;

export function isStaffPath(pathname: string): boolean {
  return STAFF_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The admin sidebar.
 *
 * `built: false` marks a section the office has been promised but that this
 * phase does not deliver. It is rendered as a dimmed, unclickable row rather
 * than a link, because a navigation item that 404s teaches people to distrust
 * the whole menu.
 */
export interface AdminNavItem {
  href: string;
  label: string;
  built: boolean;
  /** Which key of the dashboard counts, if this row shows a number. */
  badge?: 'pending' | 'open_reports' | 'renewals_pending';
  /** Restricted to administrators; moderators do not see it. */
  adminOnly?: boolean;
}

export const ADMIN_NAV: ReadonlyArray<{ heading: string; items: readonly AdminNavItem[] }> = [
  {
    heading: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', built: true }],
  },
  {
    heading: 'Advertisements',
    items: [
      { href: '/admin/advertisements/pending', label: 'Pending review', built: true, badge: 'pending' },
      { href: '/admin/advertisements/changes-requested', label: 'Changes requested', built: true },
      { href: '/admin/advertisements/approved', label: 'Approved', built: true },
      { href: '/admin/advertisements/rejected', label: 'Rejected', built: true },
      { href: '/admin/advertisements/expiring', label: 'Expiring soon', built: true },
      { href: '/admin/advertisements/expired', label: 'Expired', built: true },
      { href: '/admin/advertisements/renewals', label: 'Renewals', built: true, badge: 'renewals_pending' },
      { href: '/admin/advertisements', label: 'All advertisements', built: true },
    ],
  },
  {
    heading: 'Office',
    items: [
      { href: '/admin/payments', label: 'Payments', built: true },
      { href: '/admin/notifications', label: 'Notifications', built: true },
      /*
       * "Reported advertisements" rather than "Reports". There are two quite
       * different things called a report in this office — what a reader flags,
       * and what the business reads at the end of a month — and one menu
       * cannot call both of them Reports. The reader's queue keeps the path
       * it has always had; the business figures live under Analytics.
       */
      { href: '/admin/reports', label: 'Reported advertisements', built: true, badge: 'open_reports' },
      { href: '/admin/activity', label: 'Activity log', built: true },
      { href: '/admin/categories', label: 'Categories', built: true, adminOnly: true },
      { href: '/admin/packages', label: 'Packages', built: true, adminOnly: true },
      { href: '/admin/users', label: 'Users', built: true, adminOnly: true },
    ],
  },
  {
    heading: 'Figures',
    items: [
      { href: '/admin/analytics', label: 'Analytics', built: true },
      { href: '/admin/analytics/reports', label: 'Detailed reports', built: true },
    ],
  },
  {
    heading: 'Later phases',
    items: [
      { href: '/admin/editions', label: 'Newspaper editions', built: false },
      { href: '/admin/settings', label: 'Settings', built: false },
    ],
  },
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
