'use client';

import { usePostAd } from '@/components/post-ad/form-provider';
import { SelectField, TextareaField, TextInput } from '@/components/ui/field';
import { LOCATIONS } from '@/config/locations';
import { DESCRIPTION_MAX, TITLE_MAX } from '@/lib/post-ad/schema';

/**
 * The display advertisement request.
 *
 * A different thing from a classified, and it is treated as one: this is a
 * request for a quotation, not a listing that goes live. Size, placement and
 * rate are settled by the advertising team, so the form asks who the
 * advertiser is and what they want to say, and leaves the commercial
 * questions to the conversation that follows.
 */
export function DisplayAdForm() {
  const { state, dispatch, errorFor } = usePostAd();
  const values = state.display;

  const set = (
    key: 'organisationName' | 'title' | 'description' | 'locationSlug' | 'website',
    value: string,
  ) => dispatch({ type: 'setDisplay', key, value });
  const touch = (path: string) => dispatch({ type: 'touch', path });

  return (
    <div className="space-y-5" data-step="display-details">
      <TextInput
        label="Business or organisation name"
        required
        data-field="organisationName"
        autoComplete="organization"
        value={values.organisationName}
        onChange={(event) => set('organisationName', event.target.value)}
        onBlur={() => touch('organisationName')}
        error={errorFor('organisationName')}
        hint="As it should appear in the advertisement."
      />

      <TextInput
        label="Advertisement title"
        required
        data-field="title"
        value={values.title}
        maxLength={TITLE_MAX + 20}
        onChange={(event) => set('title', event.target.value)}
        onBlur={() => touch('title')}
        error={errorFor('title')}
        hint="The headline or campaign name, for our reference."
      />

      <TextareaField
        label="Description"
        data-field="description"
        rows={6}
        value={values.description}
        counterMax={DESCRIPTION_MAX}
        onChange={(event) => set('description', event.target.value)}
        onBlur={() => touch('description')}
        error={errorFor('description')}
        hint="What the advertisement is about, and anything our team should know about it."
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Location"
          required
          data-field="locationSlug"
          value={values.locationSlug}
          onChange={(event) => {
            set('locationSlug', event.target.value);
            touch('locationSlug');
          }}
          onBlur={() => touch('locationSlug')}
          error={errorFor('locationSlug')}
        >
          <option value="">Choose a location</option>
          {LOCATIONS.map((location) => (
            <option key={location.slug} value={location.slug}>
              {location.name}
            </option>
          ))}
        </SelectField>

        <TextInput
          label="Website"
          data-field="website"
          type="url"
          inputMode="url"
          value={values.website}
          onChange={(event) => set('website', event.target.value)}
          onBlur={() => touch('website')}
          error={errorFor('website')}
          placeholder="example.com"
        />
      </div>

      <p className="rounded-sm border border-accent-line bg-accent-surface p-3 text-sm leading-relaxed text-accent-fg">
        Display advertisements are reviewed by our advertising team before publication. Pricing
        will be confirmed by our advertising team.
      </p>
    </div>
  );
}

/** The artwork step: the uploader plus a note for the advertising team. */
export function DisplayArtworkNotes() {
  const { state, dispatch, errorFor } = usePostAd();

  return (
    <TextareaField
      label="Notes for our advertising team"
      data-field="notes"
      rows={4}
      value={state.display.notes}
      counterMax={500}
      onChange={(event) => dispatch({ type: 'setDisplay', key: 'notes', value: event.target.value })}
      onBlur={() => dispatch({ type: 'touch', path: 'notes' })}
      error={errorFor('notes')}
      hint="Preferred size or placement, the dates you have in mind, or anything else. Optional."
    />
  );
}
