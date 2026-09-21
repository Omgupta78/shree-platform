'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { updateAdvertisementAction } from '@/app/my-ads/actions';
import { Button } from '@/components/ui/button';
import { CheckboxField, SelectField, TextInput, TextareaField } from '@/components/ui/field';
import { AlertIcon } from '@/components/ui/icons';
import { CATEGORIES } from '@/config/categories';
import { LOCATIONS } from '@/config/locations';
import { categoryFormFields } from '@/config/ad-form-fields';
import { priceRole, PRICE_LABEL } from '@/config/category-fields';
import type { MyAdvertisementDetail } from '@/lib/data/my-ads';
import { canResubmit, editIntroFor } from '@/lib/post-ad/edit';
import {
  collectErrors,
  classifiedSubmissionSchema,
  displaySubmissionSchema,
  DESCRIPTION_MAX,
  MAX_IMAGES,
} from '@/lib/post-ad/schema';
import { IMAGE_RULES, acceptFiles, releaseImages, type FileRules } from '@/lib/post-ad/images';
import type { SubmissionImage } from '@/types/submission';
import { cn } from '@/lib/utils';

/**
 * Correcting an advertisement, on one page.
 *
 * Not the eight-step flow. That flow exists to walk somebody who has never
 * booked an advertisement through a decision at a time; a person who has been
 * told "please give us the locality" wants the locality box, and being made to
 * click Continue six times to reach it would be the interface arguing with
 * them.
 *
 * Validation runs the same schema the submission form and the server action
 * run, so what fails here is exactly what would fail there. It is still a
 * courtesy: the server decides.
 */
export function EditAdvertisementForm({
  advertisement,
}: {
  advertisement: MyAdvertisementDetail;
}) {
  const router = useRouter();

  const [title, setTitle] = useState(advertisement.title);
  const [description, setDescription] = useState(advertisement.description);
  const [categorySlug, setCategorySlug] = useState(advertisement.categorySlug ?? '');
  const [locationSlug, setLocationSlug] = useState(advertisement.locationSlug ?? '');
  const [price, setPrice] = useState(
    advertisement.price === null ? '' : String(advertisement.price),
  );
  const [attributes, setAttributes] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(advertisement.attributes)) {
      if (typeof value === 'string' || typeof value === 'number') out[key] = String(value);
    }
    return out;
  });

  const [organisationName, setOrganisationName] = useState(
    advertisement.display?.organisationName ?? '',
  );
  const [website, setWebsite] = useState(advertisement.display?.website ?? '');
  const [notes, setNotes] = useState(advertisement.display?.notes ?? '');

  const [contactName, setContactName] = useState(advertisement.contactName);
  const [contactPhone, setContactPhone] = useState(advertisement.contactPhone);
  const [contactWhatsapp, setContactWhatsapp] = useState(advertisement.contactWhatsapp ?? '');
  const [contactEmail, setContactEmail] = useState(advertisement.contactEmail ?? '');
  const [showPhone, setShowPhone] = useState(advertisement.showPhone);
  const [allowWhatsApp, setAllowWhatsApp] = useState(advertisement.showWhatsapp);

  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<SubmissionImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const classified = advertisement.kind === 'classified';
  const fields = classified && categorySlug ? categoryFormFields(categorySlug) : [];
  const role = classified ? priceRole(categorySlug) : 'none';
  const keptImages = advertisement.images.filter((image) => !removed.has(image.id));
  const roomForImages = MAX_IMAGES - keptImages.length - added.length;

  const contact = {
    name: contactName,
    phone: contactPhone,
    whatsapp: contactWhatsapp,
    email: contactEmail,
    showPhonePublicly: showPhone,
    allowWhatsApp,
  };

  function payload() {
    return classified
      ? {
          advertisementType: 'classified' as const,
          categorySlug,
          title,
          description,
          locationSlug,
          price,
          categorySpecificData: attributes,
          contact,
        }
      : {
          advertisementType: 'display' as const,
          organisationName,
          title,
          description,
          locationSlug,
          contact,
          website,
          notes,
        };
  }

  function validate(): boolean {
    const body = payload();
    const parsed = classified
      ? classifiedSubmissionSchema.safeParse({
          ...body,
          imageCount: keptImages.length + added.length,
          packageId: advertisement.packageId ?? 'basic',
        })
      : displaySubmissionSchema.safeParse({
          ...body,
          artworkCount: advertisement.artworkCount,
        });

    if (parsed.success) {
      setErrors({});
      return true;
    }
    setErrors(collectErrors(parsed.error));
    return false;
  }

  function pickFiles(files: FileList | null) {
    if (!files?.length) return;
    const rules: FileRules = { ...IMAGE_RULES, maxFiles: Math.max(0, roomForImages + added.length) };
    const result = acceptFiles(Array.from(files), added, rules);
    setAdded((current) => [...current, ...result.accepted]);
    setImageError(result.error);
  }

  function dropAdded(id: string) {
    setAdded((current) => {
      const going = current.filter((image) => image.id === id);
      releaseImages(going);
      return current.filter((image) => image.id !== id);
    });
  }

  async function save(resubmit: boolean) {
    if (busy) return;
    setFormError(null);

    if (!validate()) {
      setFormError('Please check the fields marked below.');
      return;
    }

    setBusy(true);

    const formData = new FormData();
    formData.set(
      'payload',
      JSON.stringify({
        ...payload(),
        advertisementId: advertisement.id,
        removeImageIds: [...removed],
        resubmit,
      }),
    );
    for (const image of added) formData.append('images', image.file, image.name);

    const result = await updateAdvertisementAction(formData);
    setBusy(false);

    if (!result.ok) {
      setFormError(result.message ?? 'That could not be saved.');
      return;
    }

    releaseImages(added);
    router.push(result.redirectTo ?? '/my-ads');
    router.refresh();
  }

  const resubmittable = canResubmit(advertisement.status);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save(resubmittable);
      }}
      className="space-y-8"
    >
      <p className="rounded-sm border border-line bg-surface-sunken p-3 text-sm text-fg-muted">
        {editIntroFor(advertisement.status)}
      </p>

      {advertisement.rejectionReason ? (
        <p className="rounded-sm border border-accent-line bg-accent-surface p-3 text-sm text-accent-fg">
          <span className="font-medium">Our office said: </span>
          {advertisement.rejectionReason}
        </p>
      ) : null}

      <section className="space-y-5">
        <h2 className="font-serif text-xl font-semibold">The advertisement</h2>

        {classified ? (
          <SelectField
            label="Category"
            value={categorySlug}
            required
            error={errors.categorySlug}
            onChange={(event) => setCategorySlug(event.target.value)}
          >
            <option value="">Choose a category</option>
            {CATEGORIES.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <TextInput
            label="Organisation name"
            value={organisationName}
            required
            error={errors.organisationName}
            onChange={(event) => setOrganisationName(event.target.value)}
          />
        )}

        <TextInput
          label="Title"
          value={title}
          required
          error={errors.title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <TextareaField
          label="Description"
          value={description}
          rows={6}
          counterMax={DESCRIPTION_MAX}
          required={classified}
          error={errors.description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <SelectField
          label="Location"
          value={locationSlug}
          required
          error={errors.locationSlug}
          onChange={(event) => setLocationSlug(event.target.value)}
        >
          <option value="">Choose a location</option>
          {LOCATIONS.map((location) => (
            <option key={location.slug} value={location.slug}>
              {location.name}
            </option>
          ))}
        </SelectField>

        {classified && role !== 'none' ? (
          <TextInput
            label={PRICE_LABEL[role]}
            value={price}
            inputMode="numeric"
            hint="Leave it blank if you would rather be asked."
            error={errors.price}
            onChange={(event) => setPrice(event.target.value)}
          />
        ) : null}

        {!classified ? (
          <>
            <TextInput
              label="Website"
              value={website}
              error={errors.website}
              onChange={(event) => setWebsite(event.target.value)}
            />
            <TextareaField
              label="Notes for our advertising team"
              value={notes}
              rows={3}
              counterMax={500}
              error={errors.notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </>
        ) : null}
      </section>

      {fields.length > 0 ? (
        <section className="space-y-5">
          <h2 className="font-serif text-xl font-semibold">About what you are advertising</h2>
          {fields.map((field) => {
            const key = `categorySpecificData.${field.key}`;
            const value = attributes[field.key] ?? '';
            const update = (next: string) =>
              setAttributes((current) => ({ ...current, [field.key]: next }));

            if (field.kind === 'select') {
              return (
                <SelectField
                  key={field.key}
                  label={field.label}
                  value={value}
                  required={field.required}
                  hint={field.hint}
                  error={errors[key]}
                  onChange={(event) => update(event.target.value)}
                >
                  <option value="">No answer</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectField>
              );
            }

            return (
              <TextInput
                key={field.key}
                label={field.label}
                value={value}
                required={field.required}
                hint={field.hint}
                placeholder={field.placeholder}
                inputMode={field.kind === 'number' ? 'numeric' : undefined}
                error={errors[key]}
                onChange={(event) => update(event.target.value)}
              />
            );
          })}
        </section>
      ) : null}

      {classified ? (
        <section className="space-y-4">
          <div>
            <h2 className="font-serif text-xl font-semibold">Photographs</h2>
            <p className="mt-1 text-sm text-fg-muted">
              The first one is what readers see on the listing card. {IMAGE_RULES.label}.
            </p>
          </div>

          {keptImages.length + added.length === 0 ? (
            <p className="rounded-sm border border-dashed border-line-strong p-4 text-sm text-fg-muted">
              There are no photographs on this advertisement.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {keptImages.map((image, index) => (
                <li key={image.id} className="space-y-1.5">
                  <div className="relative aspect-4/3 overflow-hidden rounded-sm bg-surface-sunken">
                    {image.url ? (
                      <Image src={image.url} alt="" fill sizes="200px" className="object-cover" />
                    ) : null}
                    {index === 0 ? (
                      <span className="absolute top-1 left-1 rounded-xs bg-fg/80 px-1.5 py-0.5 text-[0.625rem] font-medium text-canvas">
                        On the card
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoved((current) => new Set(current).add(image.id))}
                    className="text-xs font-medium text-critical-fg hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}

              {added.map((image) => (
                <li key={image.id} className="space-y-1.5">
                  <div className="relative aspect-4/3 overflow-hidden rounded-sm border-2 border-primary bg-surface-sunken">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL from this browser; next/image cannot optimise one. */}
                    <img src={image.previewUrl} alt="" className="h-full w-full object-cover" />
                    <span className="absolute top-1 left-1 rounded-xs bg-primary-solid px-1.5 py-0.5 text-[0.625rem] font-medium text-primary-fg">
                      New
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => dropAdded(image.id)}
                    className="text-xs font-medium text-critical-fg hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {removed.size > 0 ? (
            <p className="text-xs text-fg-subtle">
              {removed.size} photograph{removed.size === 1 ? '' : 's'} will be deleted when you save.{' '}
              <button
                type="button"
                onClick={() => setRemoved(new Set())}
                className="font-medium text-primary hover:underline"
              >
                Undo
              </button>
            </p>
          ) : null}

          <div>
            <label
              className={cn(
                'inline-flex h-10 cursor-pointer items-center rounded-sm border border-line-strong px-4 text-sm font-medium',
                roomForImages <= 0 && 'cursor-not-allowed opacity-50',
              )}
            >
              Add photographs
              <input
                type="file"
                accept={IMAGE_RULES.accept.join(',')}
                multiple
                disabled={roomForImages <= 0}
                onChange={(event) => {
                  pickFiles(event.target.files);
                  event.target.value = '';
                }}
                className="sr-only"
              />
            </label>
            <span className="ml-3 text-xs text-fg-subtle">
              {roomForImages > 0 ? `${roomForImages} more allowed` : 'That is the maximum'}
            </span>
          </div>

          {imageError ? (
            <p role="alert" className="text-sm text-critical-fg">
              {imageError}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-5">
        <div>
          <h2 className="font-serif text-xl font-semibold">How readers reach you</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Your number is published only if you tick the box. Our office can always reach you by
            email; that address is never shown to readers.
          </p>
        </div>

        <TextInput
          label="Contact name"
          value={contactName}
          required
          error={errors['contact.name']}
          onChange={(event) => setContactName(event.target.value)}
        />
        <TextInput
          label="Mobile number"
          value={contactPhone}
          type="tel"
          inputMode="numeric"
          required
          error={errors['contact.phone']}
          onChange={(event) => setContactPhone(event.target.value)}
        />
        <TextInput
          label="WhatsApp number"
          value={contactWhatsapp}
          type="tel"
          inputMode="numeric"
          hint="Leave blank to use no WhatsApp number."
          error={errors['contact.whatsapp']}
          onChange={(event) => setContactWhatsapp(event.target.value)}
        />
        <TextInput
          label="Email address"
          value={contactEmail}
          type="email"
          hint="For our office only. Never published."
          error={errors['contact.email']}
          onChange={(event) => setContactEmail(event.target.value)}
        />

        <CheckboxField
          label="Show my mobile number on the advertisement"
          checked={showPhone}
          onChange={(event) => setShowPhone(event.target.checked)}
        />
        <CheckboxField
          label="Let readers message me on WhatsApp"
          checked={allowWhatsApp}
          onChange={(event) => setAllowWhatsApp(event.target.checked)}
        />
      </section>

      {formError ? (
        <p
          role="alert"
          className="flex gap-2 rounded-sm border border-critical-line bg-critical-surface p-3 text-sm text-critical-fg"
        >
          <AlertIcon size={17} className="mt-px shrink-0" />
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button type="submit" disabled={busy} aria-busy={busy || undefined}>
          {busy ? 'Saving…' : resubmittable ? 'Save and send it back' : 'Save changes'}
        </Button>

        {resubmittable ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void save(false)}>
            Save without sending
          </Button>
        ) : null}

        <Link href="/my-ads" className="text-sm text-fg-muted underline-offset-4 hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
