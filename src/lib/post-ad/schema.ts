import { z } from 'zod';

import { categoryFormFields, type AdFormField } from '@/config/ad-form-fields';
import { CATEGORY_BY_SLUG } from '@/config/categories';
import { LOCATION_BY_SLUG } from '@/config/locations';
import { PACKAGE_BY_ID } from '@/config/packages';

/**
 * Validation for an advertisement submission.
 *
 * Pure zod and pure configuration: no React, no `window`, no `File` type used
 * as a runtime value. That is the point — when the server action arrives it
 * imports this same module and re-validates the payload, so the browser and
 * the server can never disagree about what a valid advertisement is.
 *
 * The client's job is to be helpful early. The server's job is to be the
 * authority. Nothing here is a substitute for the second check.
 */

/* ---------------------------------------------------------- primitives -- */

export const TITLE_MIN = 8;
export const TITLE_MAX = 100;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 1000;
export const MAX_PRICE = 1_000_000_000;

const required = (label: string) => `${label} is required.`;

/** Collapses runs of whitespace and trims, so "   " is empty, not valid. */
export function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export const titleSchema = z
  .string()
  .transform(clean)
  .pipe(
    z
      .string()
      .min(1, required('A title'))
      .min(TITLE_MIN, `Please use at least ${TITLE_MIN} characters so the advertisement is clear.`)
      .max(TITLE_MAX, `Please keep the title to ${TITLE_MAX} characters or fewer.`),
  );

export const descriptionSchema = z
  .string()
  .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
  .pipe(
    z
      .string()
      .min(1, required('A description'))
      .min(
        DESCRIPTION_MIN,
        `Please write at least ${DESCRIPTION_MIN} characters so readers know what is on offer.`,
      )
      .max(DESCRIPTION_MAX, `Please keep the description to ${DESCRIPTION_MAX} characters or fewer.`),
  );

/**
 * Indian mobile numbers, accepted the way people actually type them:
 * `98765 43210`, `+91 98765 43210`, `098765-43210`. Everything that is not a
 * digit is stripped, an optional 91 or leading 0 is dropped, and what must
 * remain is ten digits starting 6, 7, 8 or 9. Landlines are not accepted
 * because the advertisement's call and WhatsApp actions assume a mobile.
 */
export function normalisePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

const PHONE_MESSAGE = 'Please enter a 10-digit Indian mobile number.';

export const phoneSchema = z
  .string()
  .transform(normalisePhone)
  .pipe(z.string().min(1, required('A phone number')).regex(/^[6-9]\d{9}$/, PHONE_MESSAGE));

export const optionalPhoneSchema = z
  .string()
  .transform(normalisePhone)
  .pipe(z.union([z.literal(''), z.string().regex(/^[6-9]\d{9}$/, PHONE_MESSAGE)]));

export const optionalEmailSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.union([z.literal(''), z.email('Please enter a valid email address.')]));

export const optionalUrlSchema = z
  .string()
  .transform((value) => {
    const trimmed = value.trim();
    if (!trimmed || /^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  })
  .pipe(
    z.union([
      z.literal(''),
      z
        .url('Please enter a valid website address.')
        // Only http(s). `javascript:` and `data:` are parseable URLs and would
        // otherwise reach an href attribute.
        .refine((value) => /^https?:\/\//i.test(value), 'Please enter an http or https address.'),
    ]),
  );

/** Money as typed. Kept a string end to end; the server parses it, not us. */
export const optionalPriceSchema = z
  .string()
  .transform((value) => value.replace(/[,\s₹]/g, '').trim())
  .pipe(
    z.union([
      z.literal(''),
      z
        .string()
        .regex(/^\d+$/, 'Please enter the amount in digits only.')
        .refine((value) => Number(value) > 0, 'Please enter an amount greater than zero.')
        .refine(
          (value) => Number(value) <= MAX_PRICE,
          'That amount looks too large. Please check it.',
        ),
    ]),
  );

export const categorySlugSchema = z
  .string()
  .min(1, 'Please choose a category.')
  .refine((slug) => CATEGORY_BY_SLUG.has(slug), 'Please choose a category from the list.');

export const locationSlugSchema = z
  .string()
  .min(1, 'Please choose a location.')
  .refine((slug) => LOCATION_BY_SLUG.has(slug), 'Please choose a location from the list.');

export const packageIdSchema = z
  .string()
  .min(1, 'Please choose a package.')
  .refine((id) => PACKAGE_BY_ID.has(id), 'Please choose a package from the list.');

/* ------------------------------------------------------------- contact -- */

export const contactSchema = z.object({
  name: z
    .string()
    .transform(clean)
    .pipe(
      z
        .string()
        .min(1, required('A contact name'))
        .min(2, 'Please enter the full name.')
        .max(80, 'Please keep the name to 80 characters or fewer.'),
    ),
  phone: phoneSchema,
  whatsapp: optionalPhoneSchema,
  email: optionalEmailSchema,
  showPhonePublicly: z.boolean(),
  allowWhatsApp: z.boolean(),
});

/* ------------------------------------------- category-specific answers -- */

/**
 * Builds the schema for one category's extra fields from the configuration.
 *
 * Two deliberate behaviours:
 *
 *  - A key the caller left out is treated as empty rather than missing. The
 *    form only records what someone typed, so an untouched optional field is
 *    simply absent; "absent" and "left blank" are the same answer, and an
 *    optional field must not fail because nobody touched it.
 *  - Unknown keys are stripped rather than rejected, so a stale draft from
 *    before a field was renamed still loads. What a stripped key cannot do is
 *    reach the database.
 */
export function categoryDataSchema(categorySlug: string) {
  const fields = categoryFormFields(categorySlug);
  const shape: Record<string, z.ZodType<string>> = {};

  for (const field of fields) {
    shape[field.key] = fieldSchema(field);
  }

  return z.preprocess((value) => {
    const given = (value ?? {}) as Record<string, unknown>;
    const filled: Record<string, unknown> = { ...given };
    for (const field of fields) {
      if (filled[field.key] === undefined || filled[field.key] === null) filled[field.key] = '';
    }
    return filled;
  }, z.object(shape).strip());
}

/**
 * One field's rule.
 *
 * Optional fields are written as refinements that pass on an empty string
 * rather than as a union with `z.literal('')`. A failing union reports only
 * "Invalid input", which tells an advertiser nothing; this way the field's own
 * message — "Year of manufacture must be at least 1950." — is what they read.
 */
function fieldSchema(field: AdFormField): z.ZodType<string> {
  const blank = (value: string) => value.trim() === '';

  if (field.kind === 'select') {
    const options = field.options ?? [];
    const choose = `Please choose a ${field.label.toLowerCase()}.`;
    return z
      .string()
      .refine((value) => !(field.required && blank(value)), choose)
      .refine((value) => blank(value) || options.includes(value), choose) as z.ZodType<string>;
  }

  if (field.kind === 'number') {
    const min = field.min ?? 0;
    const max = field.max ?? Number.MAX_SAFE_INTEGER;
    return z
      .string()
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .refine((value) => !(field.required && blank(value)), required(field.label))
          .refine(
            (value) => blank(value) || /^\d+$/.test(value),
            `${field.label} must be a number.`,
          )
          .refine(
            (value) => blank(value) || Number(value) >= min,
            `${field.label} must be at least ${min}.`,
          )
          .refine(
            (value) => blank(value) || Number(value) <= max,
            `${field.label} must be ${max} or less.`,
          ),
      ) as z.ZodType<string>;
  }

  const maxLength = field.maxLength ?? 100;
  const text = z
    .string()
    .transform(clean)
    .pipe(
      z
        .string()
        .max(maxLength, `Please keep ${field.label.toLowerCase()} to ${maxLength} characters or fewer.`),
    );

  if (!field.required) return text as z.ZodType<string>;

  return z
    .string()
    .transform(clean)
    .pipe(
      z
        .string()
        .min(1, required(field.label))
        .max(
          maxLength,
          `Please keep ${field.label.toLowerCase()} to ${maxLength} characters or fewer.`,
        ),
    ) as z.ZodType<string>;
}

/* ---------------------------------------------------------- submission -- */

/**
 * Images are validated by count and by the metadata the browser reports;
 * `lib/post-ad/images.ts` holds the per-file rules. The real check — that the
 * bytes are an image at all — belongs to the upload endpoint, which will
 * sniff the content rather than believe the `type` field a client sent.
 */
export const MAX_IMAGES = 8;
export const MAX_ARTWORK_FILES = 4;

export const classifiedSubmissionSchema = z
  .object({
    advertisementType: z.literal('classified'),
    categorySlug: categorySlugSchema,
    title: titleSchema,
    description: descriptionSchema,
    locationSlug: locationSlugSchema,
    price: optionalPriceSchema,
    categorySpecificData: z.record(z.string(), z.string()),
    contact: contactSchema,
    imageCount: z.number().int().min(0).max(MAX_IMAGES, `Please use at most ${MAX_IMAGES} images.`),
    packageId: packageIdSchema,
  })
  .superRefine((value, ctx) => {
    // The category's own fields are validated against that category's rules.
    const result = categoryDataSchema(value.categorySlug).safeParse(value.categorySpecificData);
    if (result.success) return;
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: 'custom',
        path: ['categorySpecificData', ...issue.path],
        message: issue.message,
      });
    }
  });

export const displaySubmissionSchema = z.object({
  advertisementType: z.literal('display'),
  organisationName: z
    .string()
    .transform(clean)
    .pipe(
      z
        .string()
        .min(1, required('An organisation name'))
        .min(2, 'Please enter the full name of the business or organisation.')
        .max(100, 'Please keep the name to 100 characters or fewer.'),
    ),
  title: titleSchema,
  description: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(DESCRIPTION_MAX, `Please keep this to ${DESCRIPTION_MAX} characters or fewer.`)),
  locationSlug: locationSlugSchema,
  contact: contactSchema,
  website: optionalUrlSchema,
  notes: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(500, 'Please keep the notes to 500 characters or fewer.')),
  artworkCount: z
    .number()
    .int()
    .min(0)
    .max(MAX_ARTWORK_FILES, `Please attach at most ${MAX_ARTWORK_FILES} files.`),
});

export type ClassifiedPayload = z.infer<typeof classifiedSubmissionSchema>;
export type DisplayPayload = z.infer<typeof displaySubmissionSchema>;

/* ------------------------------------------------------------- errors --- */

/** Field path (`contact.phone`, `categorySpecificData.bedrooms`) to message. */
export type FieldErrors = Readonly<Record<string, string>>;

export function collectErrors(error: z.ZodError): FieldErrors {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    // First message per field: the earliest rule is the most actionable one.
    if (!(path in errors)) errors[path] = issue.message;
  }
  return errors;
}
