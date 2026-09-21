'use client';

import { usePostAd } from '@/components/post-ad/form-provider';
import { Button } from '@/components/ui/button';
import {
  AlertIcon,
  CategoryIcon,
  ClockIcon,
  FileIcon,
  GlobeIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  WhatsAppIcon,
} from '@/components/ui/icons';
import { categoryFormFields } from '@/config/ad-form-fields';
import { CATEGORY_BY_SLUG } from '@/config/categories';
import { PRICE_LABEL, priceRole } from '@/config/category-fields';
import { locationName } from '@/config/locations';
import { PACKAGE_BY_ID } from '@/config/packages';
import { isPdf } from '@/lib/post-ad/images';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SubmissionImage } from '@/types/submission';

/**
 * What the advertiser is about to send.
 *
 * Laid out like the public advertisement page — same two columns, same
 * gallery frame, same details table, same order — because the point of a
 * preview is that nothing is a surprise afterwards. Where it deliberately
 * differs it says so: a banner marks it as a preview, and the contact block
 * shows what readers will and will not see rather than pretending the
 * buttons work.
 *
 * Everything is rendered as text. Nothing the advertiser typed is ever put
 * through `dangerouslySetInnerHTML`; a description containing markup appears
 * as the characters they typed.
 */
export function AdPreview({ onEdit }: { onEdit: (stepId: string) => void }) {
  const { state } = usePostAd();

  return (
    <div data-preview className="space-y-6">
      <p className="flex gap-2 rounded-sm border border-accent-line bg-accent-surface p-3 text-sm leading-relaxed text-accent-fg">
        <AlertIcon size={17} className="mt-px shrink-0" />
        This is a preview. Nothing has been sent yet, and the advertisement is not published until
        our office has reviewed it.
      </p>

      {state.advertisementType === 'display' ? (
        <DisplayPreview onEdit={onEdit} />
      ) : (
        <ClassifiedPreview onEdit={onEdit} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ classified */

function ClassifiedPreview({ onEdit }: { onEdit: (stepId: string) => void }) {
  const { state } = usePostAd();
  const values = state.classified;
  const category = CATEGORY_BY_SLUG.get(values.categorySlug);
  const role = priceRole(values.categorySlug);
  const paragraphs = values.description.split(/\n{2,}/).filter((part) => part.trim().length > 0);
  const chosenPackage = PACKAGE_BY_ID.get(values.packageId);

  const fields = categoryFormFields(values.categorySlug)
    .map((field) => ({
      label: field.unit ? `${field.label} (${field.unit})` : field.label,
      value: values.categorySpecificData[field.key]?.trim() ?? '',
    }))
    .filter((row) => row.value.length > 0);

  return (
    <article className="rounded-md border border-line bg-surface p-4 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <Gallery images={state.images} categoryName={category?.name ?? 'Advertisement'} icon={category?.icon ?? null} />

        <div>
          <SectionEdit label="Details" onEdit={() => onEdit('details')} />

          {category ? (
            <p className="mt-1 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
              {category.name}
            </p>
          ) : null}

          <h3 className="mt-2 font-serif text-2xl leading-tight font-semibold sm:text-3xl">
            {values.title || 'Your advertisement title'}
          </h3>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <MapPinIcon size={15} />
              {values.locationSlug ? locationName(values.locationSlug) : 'Location'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon size={15} />
              Once approved
            </span>
          </div>

          {role !== 'none' && values.price.trim() ? (
            <p className="mt-4 font-serif text-2xl font-semibold">
              {formatPrice(Number(values.price.replace(/\D/g, '')), 'fixed')}
              {role === 'salary' ? (
                <span className="ml-2 font-sans text-sm font-normal text-fg-subtle">
                  {PRICE_LABEL[role].toLowerCase()} per month
                </span>
              ) : null}
            </p>
          ) : null}

          <div className="mt-5">
            <ContactSummary onEdit={() => onEdit('contact')} />
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <section>
          <SectionEdit label="Description" onEdit={() => onEdit('details')} />
          <div className="mt-3 max-w-prose space-y-3 text-[0.9375rem] leading-relaxed text-fg-muted">
            {paragraphs.length ? (
              paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
            ) : (
              <p className="text-fg-subtle">No description yet.</p>
            )}
          </div>
        </section>

        <div className="space-y-6">
          {fields.length ? (
            <section>
              <SectionEdit label="Advertisement details" onEdit={() => onEdit('specifics')} />
              <dl className="mt-3 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
                {fields.map((row) => (
                  <div key={row.label} className="bg-surface px-3 py-2.5">
                    <dt className="text-xs font-semibold tracking-[0.1em] text-fg-subtle uppercase">
                      {row.label}
                    </dt>
                    <dd className="mt-0.5 text-sm">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {chosenPackage ? (
            <section>
              <SectionEdit label="Package" onEdit={() => onEdit('package')} />
              <p className="mt-3 rounded-md border border-line bg-surface-sunken p-3 text-sm">
                <span className="font-semibold">{chosenPackage.name}</span>
                <span className="mt-0.5 block text-xs text-fg-subtle">
                  {chosenPackage.price === null
                    ? 'Pricing to be confirmed by our advertising team.'
                    : chosenPackage.summary}
                </span>
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/* --------------------------------------------------------------- display */

function DisplayPreview({ onEdit }: { onEdit: (stepId: string) => void }) {
  const { state } = usePostAd();
  const values = state.display;

  return (
    <article className="rounded-md border border-line bg-surface p-4 sm:p-6">
      <SectionEdit label="Your request" onEdit={() => onEdit('details')} />

      <h3 className="mt-2 font-serif text-2xl leading-tight font-semibold sm:text-3xl">
        {values.title || 'Your advertisement title'}
      </h3>
      <p className="mt-1 text-sm font-semibold text-fg-muted">
        {values.organisationName || 'Your organisation'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <MapPinIcon size={15} />
          {values.locationSlug ? locationName(values.locationSlug) : 'Location'}
        </span>
        {values.website ? (
          <span className="inline-flex items-center gap-1.5 break-all">
            <GlobeIcon size={15} />
            {values.website}
          </span>
        ) : null}
      </div>

      {values.description.trim() ? (
        <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed whitespace-pre-line text-fg-muted">
          {values.description}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        <section>
          <SectionEdit label="Artwork" onEdit={() => onEdit('artwork')} />
          <div className="mt-3">
            {state.artwork.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {state.artwork.map((file) => (
                  <li key={file.id}>
                    <ArtworkTile file={file} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-line-strong p-4 text-sm text-fg-muted">
                No artwork attached. Our team can prepare the design for you.
              </p>
            )}
          </div>

          {values.notes.trim() ? (
            <p className="mt-3 rounded-sm bg-surface-sunken p-3 text-sm whitespace-pre-line text-fg-muted">
              {values.notes}
            </p>
          ) : null}
        </section>

        <ContactSummary onEdit={() => onEdit('contact')} />
      </div>

      <p className="mt-6 rounded-sm border border-accent-line bg-accent-surface p-3 text-sm leading-relaxed text-accent-fg">
        Display advertisements are reviewed by our advertising team before publication. Pricing
        will be confirmed by our advertising team.
      </p>
    </article>
  );
}

/* ---------------------------------------------------------------- parts */

function SectionEdit({ label, onEdit }: { label: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-1.5">
      <h4 className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">{label}</h4>
      <button
        type="button"
        onClick={onEdit}
        data-preview-edit
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        <PencilIcon size={13} />
        Edit
        <span className="sr-only"> {label.toLowerCase()}</span>
      </button>
    </div>
  );
}

function Gallery({
  images,
  categoryName,
  icon,
}: {
  images: readonly SubmissionImage[];
  categoryName: string;
  icon: string | null;
}) {
  const primary = images[0];

  return (
    <div>
      {primary ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL
        <img
          src={primary.previewUrl}
          alt=""
          data-preview-image
          className="aspect-4/3 w-full rounded-md border border-line bg-surface-sunken object-contain"
        />
      ) : (
        <div className="flex aspect-4/3 w-full flex-col items-center justify-center gap-2 rounded-md border border-line bg-surface-sunken text-fg-subtle">
          <CategoryIcon name={icon} size={36} />
          <span className="font-serif text-lg">{categoryName}</span>
          <span className="text-xs tracking-[0.14em] uppercase">No image supplied</span>
        </div>
      )}

      {/* Every image, with the first marked — the same strip readers get on
          the published advertisement, so the preview matches what they see. */}
      {images.length > 1 ? (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <li key={image.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              <img
                src={image.previewUrl}
                alt=""
                className={cn(
                  'h-16 w-20 rounded-sm border-2 object-cover',
                  index === 0 ? 'border-primary' : 'border-line',
                )}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ArtworkTile({ file }: { file: SubmissionImage }) {
  if (isPdf(file)) {
    return (
      <span className="flex aspect-4/3 flex-col items-center justify-center gap-1 rounded-sm border border-line bg-surface-sunken text-fg-subtle">
        <FileIcon size={22} />
        <span className="max-w-full truncate px-2 text-[0.6875rem]">{file.name}</span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local object URL
    <img
      src={file.previewUrl}
      alt={file.name}
      className="aspect-4/3 w-full rounded-sm border border-line bg-surface-sunken object-contain"
    />
  );
}

/**
 * What readers will actually be able to see.
 *
 * Shown as statements rather than working buttons. A live Call button in a
 * preview invites the advertiser to test it and reach themselves; saying
 * plainly which details are published is what they need to check.
 */
function ContactSummary({ onEdit }: { onEdit: () => void }) {
  const { state } = usePostAd();
  const contact =
    state.advertisementType === 'display' ? state.display.contact : state.classified.contact;
  const isDisplay = state.advertisementType === 'display';

  const rows: { icon: React.ReactNode; text: string; shown: boolean }[] = [
    {
      icon: <PhoneIcon size={15} />,
      text: contact.phone ? formatLocalPhone(contact.phone) : 'No phone number',
      shown: isDisplay ? false : contact.showPhonePublicly && Boolean(contact.phone),
    },
    {
      icon: <WhatsAppIcon size={15} />,
      text: contact.whatsapp ? formatLocalPhone(contact.whatsapp) : 'Same number on WhatsApp',
      shown: isDisplay ? false : contact.allowWhatsApp && Boolean(contact.phone || contact.whatsapp),
    },
    {
      icon: <MailIcon size={15} />,
      text: contact.email || 'No email',
      shown: false,
    },
  ];

  return (
    <section>
      <SectionEdit label="Contact" onEdit={onEdit} />

      <p className="mt-3 text-sm font-semibold">{contact.name || 'Your name'}</p>

      <ul className="mt-2 space-y-1.5">
        {rows.map((row, index) => (
          <li
            key={index}
            className={cn(
              'flex items-center gap-2 text-sm',
              row.shown ? 'text-fg' : 'text-fg-subtle',
            )}
          >
            <span className={row.shown ? 'text-primary' : ''}>{row.icon}</span>
            <span className={row.shown ? '' : 'line-through decoration-line-strong'}>
              {row.text}
            </span>
            <span className="text-xs">{row.shown ? '(shown to readers)' : '(not published)'}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
        {isDisplay
          ? 'Your details go to our advertising team only. They are not published.'
          : 'Only the details marked as shown appear on the advertisement. Your email is used by our office and is never published.'}
      </p>
    </section>
  );
}

function formatLocalPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : value;
}

/** The two decisions at the foot of the preview. */
export function PreviewActions({
  onEdit,
  onSubmit,
  submitting,
}: {
  onEdit: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const { state } = usePostAd();
  const label = state.advertisementType === 'display' ? 'Submit Advertisement Request' : 'Submit';

  return (
    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
      <Button variant="secondary" size="lg" data-nav="edit" onClick={onEdit}>
        <PencilIcon size={17} />
        Edit Advertisement
      </Button>
      <Button size="lg" data-nav="submit" onClick={onSubmit} disabled={submitting}>
        {submitting ? 'Sending…' : label}
      </Button>
    </div>
  );
}
