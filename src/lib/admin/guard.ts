import 'server-only';

import { getCurrentProfile } from '@/lib/auth/session';
import type { ProfileRow, UserRole } from '@/types/database';

/**
 * Who is allowed into the office.
 *
 * Three independent checks stand between a signed-out visitor and an admin
 * page, and that is on purpose — each one covers a different way the others
 * can be got around:
 *
 *   1. `src/proxy.ts` reads the caller's role and issues a real HTTP redirect
 *      before any page renders. That is the one a person actually meets.
 *   2. This module is called by the admin layout and by every admin action, so
 *      a route added to the application but forgotten in the proxy's matcher
 *      still refuses rather than rendering.
 *   3. Row-level security. `moderation_ads`, `admin_users`, `audit_log` and
 *      `moderate_advertisement()` all check `is_staff()` inside the database.
 *      Even if both checks above were removed, an ordinary account querying
 *      the admin views would get nothing back and every moderation call would
 *      raise.
 *
 * The third is the one that matters. The first two are a better experience;
 * they are not the security. Being on `/admin` has never made anybody staff.
 */

export type StaffRole = Extract<UserRole, 'moderator' | 'admin'>;

export interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  role: StaffRole;
}

function toStaff(profile: ProfileRow | null): StaffMember | null {
  if (!profile) return null;
  // A blocked account is not staff, whatever its role says. `is_staff()` in
  // the database makes the same exclusion, and the two must agree or the
  // interface would offer buttons that always fail.
  if (profile.is_blocked) return null;
  if (profile.role !== 'admin' && profile.role !== 'moderator') return null;

  return {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    role: profile.role,
  };
}

/** The signed-in staff member, or null. Never throws; pages decide what to show. */
export async function getStaffMember(): Promise<StaffMember | null> {
  return toStaff(await getCurrentProfile());
}

export async function isAdministrator(): Promise<boolean> {
  const staff = await getStaffMember();
  return staff?.role === 'admin';
}

export class NotStaffError extends Error {
  constructor(message = 'This action is for Shree Classified staff.') {
    super(message);
    this.name = 'NotStaffError';
  }
}

/**
 * The staff member, or a thrown error. For server actions, where there is no
 * page to render a panel and the right answer is to refuse.
 */
export async function requireStaff(): Promise<StaffMember> {
  const staff = await getStaffMember();
  if (!staff) throw new NotStaffError();
  return staff;
}

/**
 * Some things are an administrator's, not a moderator's: changing a category,
 * blocking an account. A moderator reviews advertisements.
 */
export async function requireAdministrator(): Promise<StaffMember> {
  const staff = await requireStaff();
  if (staff.role !== 'admin') {
    throw new NotStaffError('This action is for an administrator.');
  }
  return staff;
}
