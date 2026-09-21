import type { Metadata } from 'next';
import Link from 'next/link';

import {
  AdminEmpty,
  AdminPanel,
  Detail,
  StatusBadge,
  waitingLabel,
} from '@/components/admin/admin-ui';
import { CorrectionForm } from '@/components/admin/correction-form';
import { LifecyclePanel } from '@/components/admin/lifecycle-panel';
import { ArtworkReview, ImageReview } from '@/components/admin/image-review';
import { ModerationActions } from '@/components/admin/moderation-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { categoryFormFields } from '@/config/ad-form-fields';
import {
  getAdvertisementForReview,
  getAdvertisementHistory,
} from '@/lib/admin/advertisements';
import { getStaffMember } from '@/lib/admin/guard';
import { ACTION_COPY, EVENT_COPY } from '@/lib/admin/labels';
import { getLifecycleSettings } from '@/lib/data/lifecycle-settings';
import { formatDate, formatPhone, formatPrice, formatRelative, telHref } from '@/lib/format';

export const metadata: Metadata = { title: 'Review' };

/**
 * One advertisement, as the office has to see it.
 *
 * Two columns: the advertisement itself on the left, close to how a reader
 * would see it, and everything a reader never sees on the right — who sent it,
 * how to reach them, what has already been decided, and the decisions
 * available now.
 *
 * The left column does NOT reuse the public advertisement component, and that
 * is the single most important line in this file. The public component is
 * built around `public_ads`, which nulls a withheld telephone number and has
 * no contact email at all. Sharing it here would mean either that this page
 * cannot show the office what it needs, or — far worse — that somebody widens
 * the public component "just for admin" and the widening ships to the reading
 * side. Two screens, two data sources, no shared component.
 */
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const advertisement = await getAdvertisementForReview(id);

  if (!advertisement) {
    return (
      <AdminEmpty
        title="No such advertisement"
        description="It may have been deleted by its owner, or the link may be wrong."
      />
    );
  }

  const [history, staff, settings] = await Promise.all([
    getAdvertisementHistory(id),
    getStaffMember(),
    getLifecycleSettings(),
  ]);
  /*
   * The category's own questions, in the order the advertiser answered them,
   * followed by anything in `attributes` that no longer has a question — a
   * field renamed since the advertisement was submitted still has to be
   * readable, or the office is moderating something they cannot fully see.
   */
  const fields = advertisement.categorySlug
    ? categoryFormFields(advertisement.categorySlug)
    : [];
  const known = new Set(fields.map((field) => field.key));
  const orphans = Object.entries(advertisement.attributes).filter(
    ([key, value]) => !known.has(key) && value !== null && value !== '',
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={advertisement.status} />
            {advertisement.kind === 'display' ? <Badge>Display</Badge> : null}
            {advertisement.isFeatured ? <Badge tone="featured">Featured</Badge> : null}
            {advertisement.openReportCount > 0 ? (
              <Badge tone="danger">
                {advertisement.openReportCount} open report
                {advertisement.openReportCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
            <span className="font-mono text-xs text-fg-subtle">{advertisement.reference}</span>
          </div>
          <h1 className="mt-1.5 font-serif text-2xl leading-tight font-semibold sm:text-3xl">
            {advertisement.title}
          </h1>
        </div>

        <div className="flex gap-2">
          <Button href="/admin/advertisements/pending" variant="secondary" size="sm">
            ← Queue
          </Button>
          {advertisement.status === 'approved' ? (
            <Button href={`/classifieds/${advertisement.slug}`} variant="secondary" size="sm">
              See it live
            </Button>
          ) : null}
        </div>
      </div>

      {advertisement.rejectionReason ? (
        <p className="mb-5 rounded-md border border-accent-line bg-accent-surface p-3 text-sm text-accent-fg">
          <span className="font-medium">The advertiser has been told: </span>
          {advertisement.rejectionReason}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        {/* ---------------------------------------------- the advertisement */}
        <div className="space-y-5">
          <AdminPanel title="As submitted">
            <div className="space-y-4 px-4 py-4">
              <div className="flex flex-wrap items-baseline gap-3">
                {advertisement.kind === 'classified' ? (
                  <span className="font-serif text-xl font-semibold">
                    {formatPrice(advertisement.price, advertisement.priceType)}
                  </span>
                ) : null}
                <span className="text-sm text-fg-muted">
                  {advertisement.categoryName ?? 'No category'}
                  {advertisement.locationName ? ` · ${advertisement.locationName}` : ''}
                </span>
              </div>

              {advertisement.description ? (
                <div className="space-y-2 text-[0.9375rem] leading-relaxed">
                  {advertisement.description.split(/\n{2,}/).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-fg-subtle italic">No description was written.</p>
              )}
            </div>

            {fields.length > 0 || orphans.length > 0 ? (
              <dl className="border-t border-line">
                {fields.map((field) => {
                  const value = advertisement.attributes[field.key];
                  if (value === undefined || value === null || value === '') return null;
                  return (
                    <Detail key={field.key} label={field.label}>
                      {String(value)}
                    </Detail>
                  );
                })}
                {orphans.map(([key, value]) => (
                  <Detail key={key} label={key}>
                    {String(value)}
                  </Detail>
                ))}
              </dl>
            ) : null}
          </AdminPanel>

          <AdminPanel
            title="Correct"
            description="For a typo or a wrong category. Anything the advertiser must change themselves goes back to them with “Request changes”."
          >
            <CorrectionForm
              advertisementId={advertisement.id}
              kind={advertisement.kind}
              title={advertisement.title}
              description={advertisement.description}
              categorySlug={advertisement.categorySlug}
              locationSlug={advertisement.locationSlug}
            />
          </AdminPanel>

          {advertisement.display ? (
            <AdminPanel title="The organisation">
              <dl>
                <Detail label="Name">{advertisement.display.organisationName}</Detail>
                <Detail label="Website">
                  {advertisement.display.website ? (
                    <a
                      href={advertisement.display.website}
                      target="_blank"
                      rel="noreferrer nofollow"
                      className="text-primary hover:underline"
                    >
                      {advertisement.display.website}
                    </a>
                  ) : (
                    '—'
                  )}
                </Detail>
                <Detail label="Notes to the office">
                  {advertisement.display.notes ?? '—'}
                </Detail>
              </dl>
            </AdminPanel>
          ) : null}

          <AdminPanel
            title={`Photographs (${advertisement.images.length})`}
            description="What readers will see on the card and on the advertisement page."
          >
            <ImageReview images={advertisement.images} />
          </AdminPanel>

          {advertisement.kind === 'display' || advertisement.artwork.length > 0 ? (
            <AdminPanel
              title={`Artwork (${advertisement.artwork.length})`}
              description="Private to the office. Links expire after a few minutes."
            >
              <ArtworkReview artwork={advertisement.artwork} />
            </AdminPanel>
          ) : null}
        </div>

        {/* --------------------------------------------------- the office */}
        <div className="space-y-5">
          <AdminPanel title="Moderation">
            <dl>
              <Detail label="Status">
                <StatusBadge status={advertisement.status} />
              </Detail>
              <Detail label="Submitted">
                {formatDate(advertisement.createdAt)} · {formatRelative(advertisement.createdAt)}
              </Detail>
              {advertisement.status === 'pending' ? (
                <Detail label="Waiting">{waitingLabel(advertisement.hoursWaiting)}</Detail>
              ) : null}
              {advertisement.publishedAt ? (
                <Detail label="Published">{formatDate(advertisement.publishedAt)}</Detail>
              ) : null}
              {advertisement.expiresAt ? (
                <Detail label="Runs until">{formatDate(advertisement.expiresAt)}</Detail>
              ) : null}
              <Detail label="Package">{advertisement.packageId ?? '—'}</Detail>
              <Detail label="Views">
                <span className="tabular-nums">{advertisement.viewCount}</span>
              </Detail>
              <Detail label="Advertisement ID">
                <span className="font-mono text-xs break-all">{advertisement.id}</span>
              </Detail>
            </dl>

            <div className="border-t border-line">
              <ModerationActions
                advertisementId={advertisement.id}
                status={advertisement.status}
                reference={advertisement.reference}
              />
            </div>
          </AdminPanel>

          {staff ? (
            <LifecyclePanel advertisement={advertisement} role={staff.role} settings={settings} />
          ) : null}

          <AdminPanel
            title="Contact details"
            description="Given by the advertiser for publication, subject to what they consented to."
          >
            <dl>
              <Detail label="Name">{advertisement.contactName}</Detail>
              <Detail label="Telephone">
                <a href={telHref(advertisement.contactPhone)} className="text-primary hover:underline">
                  {formatPhone(advertisement.contactPhone)}
                </a>
                {advertisement.showPhone ? null : (
                  <span className="mt-0.5 block text-xs text-critical-fg">
                    Withheld from readers
                  </span>
                )}
              </Detail>
              <Detail label="WhatsApp">
                {advertisement.contactWhatsapp ? (
                  <>
                    {formatPhone(advertisement.contactWhatsapp)}
                    {advertisement.showWhatsapp ? null : (
                      <span className="mt-0.5 block text-xs text-critical-fg">
                        Withheld from readers
                      </span>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </Detail>
              <Detail label="Email">
                {advertisement.contactEmail ?? '—'}
                <span className="mt-0.5 block text-xs text-fg-subtle">Never published</span>
              </Detail>
            </dl>
          </AdminPanel>

          <AdminPanel title="Advertiser">
            <dl>
              <Detail label="Account">
                {advertisement.advertiserName}
                {advertisement.advertiserBlocked ? (
                  <Badge tone="danger" className="ml-2">
                    Blocked
                  </Badge>
                ) : null}
              </Detail>
              <Detail label="Email">{advertisement.advertiserEmail ?? '—'}</Detail>
              <Detail label="Telephone">
                {advertisement.advertiserPhone
                  ? formatPhone(advertisement.advertiserPhone)
                  : '—'}
              </Detail>
              <Detail label="With us since">
                {formatDate(advertisement.advertiserSince)}
              </Detail>
            </dl>
          </AdminPanel>

          <AdminPanel title="History" description="Every decision recorded against this advertisement.">
            {history.length === 0 ? (
              <p className="px-4 py-6 text-sm text-fg-muted">Nothing recorded yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {history.map((entry) => (
                  <li key={entry.id} className="px-4 py-3">
                    <p className="text-sm">
                      <span className="font-medium">
                        {entry.actor_name ?? 'The system'}
                      </span>{' '}
                      {(entry.event && EVENT_COPY[entry.event]) ?? ACTION_COPY[entry.action] ?? entry.action}
                      {entry.previous_status && entry.new_status ? (
                        <>
                          {' '}
                          <span className="text-fg-muted">
                            ({entry.previous_status} → {entry.new_status})
                          </span>
                        </>
                      ) : null}
                    </p>
                    {entry.note ? (
                      <p className="mt-1 text-sm text-fg-muted">“{entry.note}”</p>
                    ) : null}
                    <p className="mt-1 text-xs text-fg-subtle">
                      {formatDate(entry.occurred_at)} · {formatRelative(entry.occurred_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </AdminPanel>

          {advertisement.openReportCount > 0 ? (
            <p className="rounded-md border border-critical-line bg-critical-surface p-3 text-sm text-critical-fg">
              Readers have reported this advertisement.{' '}
              <Link href="/admin/reports" className="font-medium underline underline-offset-2">
                Read the reports
              </Link>{' '}
              before deciding.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
