'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

import { AdPreview, PreviewActions } from '@/components/post-ad/ad-preview';
import { AdvertisementTypeSelector } from '@/components/post-ad/advertisement-type-selector';
import { BasicDetailsForm } from '@/components/post-ad/basic-details-form';
import { CategorySelector } from '@/components/post-ad/category-selector';
import { CategorySpecificFields } from '@/components/post-ad/category-specific-fields';
import { ContactInformationForm } from '@/components/post-ad/contact-information-form';
import { DisplayAdForm, DisplayArtworkNotes } from '@/components/post-ad/display-ad-form';
import { DraftManager, DraftRestoredNotice } from '@/components/post-ad/draft-manager';
import { PostAdProvider, usePostAd } from '@/components/post-ad/form-provider';
import type { AdvertisementPackageConfig } from '@/config/packages';
import { FormProgress } from '@/components/post-ad/form-progress';
import { ImageUploader } from '@/components/post-ad/image-uploader';
import { PackageSelector } from '@/components/post-ad/package-selector';
import { StepNavigation, focusFirstInvalid } from '@/components/post-ad/step-navigation';
import { SubmissionSuccess } from '@/components/post-ad/submission-success';
import { usePostAdDraft } from '@/components/post-ad/use-draft';
import { UnsavedChangesGuard } from '@/components/post-ad/unsaved-changes-guard';
import { Container } from '@/components/ui/container';
import { AlertIcon } from '@/components/ui/icons';
import { ARTWORK_RULES, IMAGE_RULES, releaseImages } from '@/lib/post-ad/images';
import { toSubmission } from '@/lib/post-ad/state';
import { stepIndexById } from '@/lib/post-ad/steps';
import { SubmissionError, submitAdvertisement } from '@/lib/post-ad/submit';

/**
 * The submission page.
 *
 * A thin shell: it decides which step's component to show and owns nothing
 * else. Form state lives in the provider, validation in the zod schema, file
 * handling in `lib/post-ad/images.ts`, drafts in `lib/post-ad/draft.ts` and
 * submission in `lib/post-ad/submit.ts`.
 *
 * The submission is gated, not the form. A visitor fills everything in and is
 * asked to sign in only when they press Submit, so nobody loses their typing
 * to a login wall — and the draft is already on the device, so it survives the
 * round trip to the sign-in page and back. `/post-ad` is deliberately absent
 * from the protected routes in `config/navigation.ts` for that reason.
 */
export function PostAdPage({ packages }: { packages: AdvertisementPackageConfig[] }) {
  return (
    <PostAdProvider>
      <UnsavedChangesGuard />
      <PostAdFlow packages={packages} />
    </PostAdProvider>
  );
}

function PostAdFlow({ packages }: { packages: AdvertisementPackageConfig[] }) {
  const { state, dispatch, step, steps } = usePostAd();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signInNeeded, setSignInNeeded] = useState(false);

  // Restore, autosave and object-URL cleanup. Owned by the page so they run
  // from the first render, whatever step is on screen.
  usePostAdDraft(state, dispatch);

  const goToStep = useCallback(
    (stepId: string) => {
      dispatch({ type: 'goToStep', index: stepIndexById(state.advertisementType, stepId) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [dispatch, state.advertisementType],
  );

  async function submit() {
    if (state.submitting) return; // A second click must not send a second time.
    setSubmitError(null);
    setSignInNeeded(false);
    dispatch({ type: 'submitting' });

    try {
      const result = await submitAdvertisement(toSubmission(state));
      dispatch({ type: 'submitted', result });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      // The server's own words when it gave any — "that file is not a JPG" is
      // worth more to somebody than "something is missing".
      if (error instanceof SubmissionError) {
        setSignInNeeded(error.code === 'auth');
        setSubmitError(error.message);
      } else {
        setSubmitError(
          'Something is still missing from the advertisement. Please go back and check the earlier steps.',
        );
      }
      dispatch({ type: 'attemptStep' });
    }
  }

  function postAnother() {
    releaseImages(state.images);
    releaseImages(state.artwork);
    dispatch({ type: 'reset' });
    window.scrollTo({ top: 0 });
  }

  if (state.submitted) {
    return (
      <Container size="narrow">
        <SubmissionSuccess result={state.submitted} onPostAnother={postAnother} />
      </Container>
    );
  }

  const onPreview = step.id === 'preview';

  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <Intro full={step.id === 'type'} />

        <div className="mt-6">
          <DraftRestoredNotice />
        </div>

        <div className="mt-8">
          <FormProgress />
        </div>

        <div className="mt-8">
          <h2 className="font-serif text-2xl font-semibold sm:text-3xl">{step.heading}</h2>
          {step.description ? (
            <p className="mt-2 text-[0.9375rem] text-fg-muted">{step.description}</p>
          ) : null}

          <div className="mt-6">
            <StepBody packages={packages} />
          </div>

          {submitError ? (
            <div
              role="alert"
              className="mt-6 rounded-sm border border-critical-line bg-critical-surface p-3 text-sm text-critical-fg"
            >
              <p className="flex gap-2">
                <AlertIcon size={17} className="mt-px shrink-0" />
                {submitError}
              </p>
              {signInNeeded ? (
                <p className="mt-3 pl-6">
                  <Link
                    href={`/sign-in?next=${encodeURIComponent('/post-ad')}`}
                    className="font-medium underline underline-offset-2"
                  >
                    Sign in and come back
                  </Link>{' '}
                  — your answers are saved on this device.
                </p>
              ) : null}
            </div>
          ) : null}

          {onPreview ? (
            <PreviewActions
              onEdit={() => goToStep(steps[Math.max(steps.length - 2, 0)]?.id ?? 'details')}
              onSubmit={submit}
              submitting={state.submitting}
            />
          ) : (
            <StepNavigation
              onContinue={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            />
          )}
        </div>

        {step.id !== 'type' ? (
          <div className="mt-10 border-t border-line pt-6">
            <DraftManager />
          </div>
        ) : null}
      </div>
    </Container>
  );
}

/** Which step is on screen. One lookup, no nested conditionals. */
function StepBody({ packages }: { packages: AdvertisementPackageConfig[] }) {
  const { state, step, dispatch } = usePostAd();

  switch (step.id) {
    case 'type':
      return <AdvertisementTypeSelector />;

    case 'category':
      return <CategorySelector />;

    case 'details':
      return state.advertisementType === 'display' ? <DisplayAdForm /> : <BasicDetailsForm />;

    case 'specifics':
      return <CategorySpecificFields />;

    case 'contact':
      return <ContactInformationForm />;

    case 'images':
      return (
        <ImageUploader
          target="images"
          rules={IMAGE_RULES}
          heading="Add photographs"
          emptyHint="An advertisement with a photograph is read more often. This step is optional."
        />
      );

    case 'artwork':
      return (
        <div className="space-y-6">
          <ImageUploader
            target="artwork"
            rules={ARTWORK_RULES}
            heading="Attach your artwork"
            emptyHint="Send a print-ready file if you have one. Our team can also design it for you."
          />
          <DisplayArtworkNotes />
        </div>
      );

    case 'package':
      return <PackageSelector packages={packages} />;

    case 'preview':
      return (
        <AdPreview
          onEdit={(stepId) => {
            dispatch({ type: 'goToStep', index: stepIndexById(state.advertisementType, stepId) });
            focusFirstInvalid();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      );

    default:
      return null;
  }
}

/**
 * The introduction.
 *
 * The explanation earns its place on the first screen and nowhere else. By
 * step six the advertiser has decided; leaving three paragraphs of pitch above
 * every step would push the actual form off a phone screen.
 */
function Intro({ full }: { full: boolean }) {
  return (
    <header>
      <h1 className="font-serif text-3xl leading-tight font-semibold sm:text-4xl">
        Post Your Advertisement
      </h1>
      <p className="mt-2 text-lg text-fg-muted">
        Reach local customers through Shree Classified.
      </p>

      {full ? (
        <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-muted">
          Book an advertisement on the Shree Classified digital platform for Roorkee and Haridwar
          district. Fill in the details below and our office will review your advertisement before
          it is published. There is nothing to pay at this stage.
        </p>
      ) : null}
    </header>
  );
}
