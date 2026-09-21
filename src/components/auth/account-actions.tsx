import { Button } from '@/components/ui/button';
import { ACCOUNT_ACTIONS } from '@/config/navigation';
import { getCurrentProfile } from '@/lib/auth/session';

/**
 * The account corner of the header.
 *
 * A Server Component passed into the header as a prop, because the header is a
 * Client Component (it reads the pathname) and who is signed in must be
 * decided on the server from a verified token. Rendering it as a slot keeps
 * the session out of the client bundle entirely: the browser receives the
 * finished markup, not the user object.
 */
export async function AccountActions({ variant = 'header' }: { variant?: 'header' | 'menu' }) {
  const profile = await getCurrentProfile();
  const menu = variant === 'menu';
  const shared = menu ? { fullWidth: true as const } : { size: 'sm' as const };
  const hideOnPhone = menu ? undefined : 'hidden md:inline-flex';

  if (!profile) {
    return (
      <>
        <Button href={ACCOUNT_ACTIONS.post.href} className={hideOnPhone} {...shared}>
          {ACCOUNT_ACTIONS.post.label}
        </Button>
        <Button
          href={ACCOUNT_ACTIONS.signIn.href}
          variant="secondary"
          className={hideOnPhone}
          {...shared}
        >
          {ACCOUNT_ACTIONS.signIn.label}
        </Button>
      </>
    );
  }

  // The first name is enough, and is what the person would use themselves.
  const firstName = profile.full_name.split(/\s+/)[0] ?? 'Account';
  const staff = !profile.is_blocked && profile.role !== 'user';

  return (
    <>
      {/*
        The way into the office, for the people who have one. Hiding this link
        is not what keeps anyone out — the proxy, the admin layout and the
        database each refuse independently — it simply spares everybody else a
        door they cannot open.
      */}
      {staff ? (
        <Button href="/admin" variant="secondary" className={hideOnPhone} {...shared}>
          Admin
        </Button>
      ) : null}
      <Button href={ACCOUNT_ACTIONS.post.href} className={hideOnPhone} {...shared}>
        {ACCOUNT_ACTIONS.post.label}
      </Button>
      <Button
        href={ACCOUNT_ACTIONS.myAds.href}
        variant="secondary"
        className={hideOnPhone}
        {...shared}
      >
        {menu ? ACCOUNT_ACTIONS.myAds.label : firstName}
      </Button>

      {/*
        A form, not a link: signing out is a state change, and a GET would let a
        prefetch or an image tag do it.
      */}
      <form action="/auth/sign-out" method="post" className={menu ? 'w-full' : 'contents'}>
        <Button
          type="submit"
          variant="ghost"
          className={hideOnPhone}
          {...shared}
        >
          Sign out
        </Button>
      </form>
    </>
  );
}
