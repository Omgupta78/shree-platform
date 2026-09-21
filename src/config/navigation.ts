/**
 * Navigation, defined once and consumed by the header, the mobile menu and
 * the footer so the three can never drift apart.
 */
export interface NavLink {
  href: string;
  label: string;
}

export const PRIMARY_NAV: readonly NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/classifieds', label: 'Classifieds' },
  { href: '/categories', label: 'Categories' },
  { href: '/edition', label: "Today's Edition" },
  { href: '/advertise', label: 'Advertise With Us' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const;

export const LEGAL_NAV: readonly NavLink[] = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/report', label: 'Report an Advertisement' },
] as const;

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
      { href: '/admin/reports', label: 'Reports', built: true, badge: 'open_reports' },
      { href: '/admin/activity', label: 'Activity log', built: true },
      { href: '/admin/categories', label: 'Categories', built: true, adminOnly: true },
      { href: '/admin/packages', label: 'Packages', built: true, adminOnly: true },
      { href: '/admin/users', label: 'Users', built: true, adminOnly: true },
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
