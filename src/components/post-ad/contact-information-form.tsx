'use client';

import { usePostAd } from '@/components/post-ad/form-provider';
import { CheckboxField, TextInput } from '@/components/ui/field';
import { activeContact } from '@/lib/post-ad/state';
import type { ContactInformation } from '@/types/submission';

/**
 * Contact details, and what the advertiser agrees to publish.
 *
 * The two checkboxes are consent, not display logic. The public advertisement
 * shows a number only when `showPhonePublicly` is set, and the WhatsApp
 * button appears only when `allowWhatsApp` is. Both are re-read on the server
 * before anything is published, because a browser can send whatever it likes
 * and an advertiser's telephone number is not something to get wrong.
 */
export function ContactInformationForm() {
  const { state, dispatch, errorFor } = usePostAd();
  const contact = activeContact(state);

  const set = (key: keyof ContactInformation, value: string | boolean) =>
    dispatch({ type: 'setContact', key, value });
  const touch = (key: string) => dispatch({ type: 'touch', path: `contact.${key}` });

  return (
    <div className="space-y-5" data-step="contact">
      <TextInput
        label="Name"
        required
        data-field="contactName"
        autoComplete="name"
        value={contact.name}
        onChange={(event) => set('name', event.target.value)}
        onBlur={() => touch('name')}
        error={errorFor('contact.name')}
        hint="As it should appear on the advertisement."
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput
          label="Phone number"
          required
          data-field="contactPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={contact.phone}
          onChange={(event) => set('phone', event.target.value)}
          onBlur={() => touch('phone')}
          error={errorFor('contact.phone')}
          placeholder="98765 43210"
        />

        <TextInput
          label="WhatsApp number"
          data-field="contactWhatsapp"
          type="tel"
          inputMode="tel"
          value={contact.whatsapp}
          onChange={(event) => set('whatsapp', event.target.value)}
          onBlur={() => touch('whatsapp')}
          error={errorFor('contact.whatsapp')}
          hint="Leave blank if it is the same as above."
        />
      </div>

      <TextInput
        label="Email"
        data-field="contactEmail"
        type="email"
        autoComplete="email"
        value={contact.email}
        onChange={(event) => set('email', event.target.value)}
        onBlur={() => touch('email')}
        error={errorFor('contact.email')}
        hint="Used by our office to reach you about this advertisement. It is not published."
      />

      <fieldset className="rounded-md border border-line bg-surface-sunken p-4">
        <legend className="px-1 text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
          What readers can see
        </legend>

        <div className="mt-2 space-y-4">
          <CheckboxField
            label="Display my phone number on the advertisement"
            data-field="showPhone"
            checked={contact.showPhonePublicly}
            onChange={(event) => set('showPhonePublicly', event.target.checked)}
            hint="Readers can call you directly. Untick this and our office passes enquiries on instead."
          />

          <CheckboxField
            label="Allow readers to message me on WhatsApp"
            data-field="allowWhatsApp"
            checked={contact.allowWhatsApp}
            onChange={(event) => set('allowWhatsApp', event.target.checked)}
            hint="Adds a WhatsApp button to the advertisement."
          />
        </div>

        {!contact.showPhonePublicly && !contact.allowWhatsApp ? (
          <p className="mt-4 text-xs leading-relaxed text-fg-muted">
            No contact details will be shown. Readers will have no way to reach you from the
            advertisement itself, so please make sure the description says how to get in touch.
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
