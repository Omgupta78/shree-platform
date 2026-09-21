import { SITE } from '@/config/site';

/**
 * Safety note.
 *
 * Phrased as the printed edition phrases its disclaimer: a plain request to
 * verify, with no claim that the platform screens advertisers or protects
 * transactions, because it does neither.
 */
export function SafetyNotice() {
  return (
    <aside className="rounded-md border border-accent-line bg-accent-surface p-4">
      <p className="text-sm leading-relaxed text-accent-fg">
        Please verify the advertiser and the advertisement details before making any
        payment or sharing sensitive information. {SITE.name} publishes advertisements
        as supplied and does not verify their contents.
      </p>
    </aside>
  );
}
