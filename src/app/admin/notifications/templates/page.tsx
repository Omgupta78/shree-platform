import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminPageHeader, AdminPanel } from '@/components/admin/admin-ui';
import { Badge } from '@/components/ui/badge';
import { isEmailConfigured, isWhatsAppConfigured } from '@/lib/notifications/config';
import { actionFor, subjectFor } from '@/lib/notifications/templates';
import type { NotificationType } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Message templates' };

/**
 * What each message says, and when it is sent.
 *
 * Read-only, and that is the decision rather than an omission. A template is
 * code: it has a subject that must match its body, a call to action that must
 * point somewhere real, and an escaping rule that must not be forgotten. They
 * live in `src/lib/notifications/templates.ts`, in version control, where a
 * change is reviewed and can be undone. A visual editor in an admin screen is
 * a way to ship a broken email on a Sunday with nobody able to say what it
 * used to say.
 *
 * What this page is for is answering "what does the customer actually get when
 * I press Reject?" — which somebody in the office needs to know before they
 * press it.
 */
const CATALOGUE: ReadonlyArray<{
  type: NotificationType;
  when: string;
  audience: 'advertiser' | 'office';
}> = [
  { type: 'advertisement_submitted', when: 'An advertisement is sent to us.', audience: 'advertiser' },
  { type: 'advertisement_approved', when: 'The office approves it.', audience: 'advertiser' },
  { type: 'advertisement_rejected', when: 'The office does not accept it. Carries the reason given.', audience: 'advertiser' },
  { type: 'advertisement_changes_requested', when: 'The office sends it back for a change. Links to the edit page.', audience: 'advertiser' },
  { type: 'advertisement_expiring', when: 'A run is inside the expiring-soon window. Once per run.', audience: 'advertiser' },
  { type: 'advertisement_expired', when: 'A run ends, by the sweep or by hand.', audience: 'advertiser' },
  { type: 'renewal_submitted', when: 'A renewal is asked for.', audience: 'advertiser' },
  { type: 'renewal_approved', when: 'The office approves a renewal.', audience: 'advertiser' },
  { type: 'renewal_rejected', when: 'The office does not approve a renewal.', audience: 'advertiser' },
  { type: 'payment_successful', when: 'A payment is verified. Says the advertisement still awaits review.', audience: 'advertiser' },
  { type: 'payment_failed', when: 'A payment does not complete.', audience: 'advertiser' },
  { type: 'payment_cancelled', when: 'The advertiser closes the checkout.', audience: 'advertiser' },
  { type: 'staff_advertisement_submitted', when: 'Any advertisement arrives in the queue.', audience: 'office' },
  { type: 'staff_renewal_submitted', when: 'Any renewal is asked for.', audience: 'office' },
  { type: 'staff_payment_received', when: 'Any payment settles.', audience: 'office' },
  { type: 'staff_report_received', when: 'A reader reports an advertisement.', audience: 'office' },
];

export default function TemplatesPage() {
  const email = isEmailConfigured();
  const whatsapp = isWhatsAppConfigured();

  return (
    <>
      <AdminPageHeader
        title="Message templates"
        description="Every message the site sends, when it is sent, and to whom."
        count={CATALOGUE.length}
      />

      <p className="mb-4 text-sm">
        <Link href="/admin/notifications" className="text-primary hover:underline">
          ← Notifications
        </Link>
      </p>

      <div className="mb-4 rounded-sm border border-line bg-surface-sunken p-3 text-sm leading-relaxed text-fg-muted">
        <p>
          <strong className="font-semibold text-fg">Email:</strong>{' '}
          {email ? 'connected.' : 'not connected — nothing is sent, and queued messages are recorded as skipped.'}{' '}
          <strong className="font-semibold text-fg">WhatsApp:</strong>{' '}
          {whatsapp
            ? 'connected.'
            : 'not connected — a business-initiated WhatsApp message must be an approved template, so an account and a template name are both needed.'}
        </p>
        <p className="mt-2">
          The wording lives in <code className="text-xs">src/lib/notifications/templates.ts</code>,
          in version control. It is shown here, not edited here.
        </p>
      </div>

      <AdminPanel>
        <ul className="divide-y divide-line">
          {CATALOGUE.map((item) => (
            <li key={item.type} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-medium">{subjectFor(item.type)}</p>
                <Badge tone={item.audience === 'office' ? 'neutral' : 'featured'}>
                  {item.audience === 'office' ? 'To the office' : 'To the advertiser'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-fg-muted">{item.when}</p>
              <p className="mt-1 text-xs text-fg-subtle">
                <code>{item.type}</code>
                {actionFor(item.type) ? ` · button: “${actionFor(item.type)}”` : null}
              </p>
            </li>
          ))}
        </ul>
      </AdminPanel>
    </>
  );
}
