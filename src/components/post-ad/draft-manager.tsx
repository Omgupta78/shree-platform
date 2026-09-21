'use client';

import { useEffect, useState } from 'react';

import { usePostAd } from '@/components/post-ad/form-provider';
import { Button } from '@/components/ui/button';
import { CheckIcon, SaveIcon, TrashIcon } from '@/components/ui/icons';
import { clearDraft, saveDraft } from '@/lib/post-ad/draft';
import { releaseImages } from '@/lib/post-ad/images';

/**
 * The Save Draft and Discard controls.
 *
 * Only the controls. Restoring, autosaving and cleaning up object URLs live
 * in `usePostAdDraft`, which the page calls, because those must run whether or
 * not this component is on screen.
 *
 * Saving is explicit as well as automatic: someone who presses Save wants to
 * be told it happened, and someone who simply closes the tab wants their
 * typing back regardless.
 */
export function DraftManager() {
  const { state, dispatch } = usePostAd();
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [justSaved]);

  if (state.submitted) return null;

  function save() {
    const at = saveDraft(state);
    if (at) dispatch({ type: 'draftSaved', at });
    setJustSaved(true);
  }

  function discard() {
    releaseImages(state.images);
    releaseImages(state.artwork);
    clearDraft();
    dispatch({ type: 'reset' });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" onClick={save} data-action="save-draft">
        <SaveIcon size={15} />
        Save Draft
      </Button>

      {state.dirty || state.draftSavedAt ? (
        <Button variant="ghost" size="sm" onClick={discard} data-action="discard-draft">
          <TrashIcon size={15} />
          Discard
        </Button>
      ) : null}

      <span role="status" className="text-xs text-fg-subtle" data-draft-status>
        {justSaved ? (
          <span className="inline-flex items-center gap-1 font-medium text-positive-fg">
            <CheckIcon size={13} />
            Draft saved
          </span>
        ) : state.draftSavedAt ? (
          'Draft saved on this device'
        ) : (
          ''
        )}
      </span>
    </div>
  );
}

/**
 * The line that tells an advertiser their draft came back, and what could not
 * come back with it. Shown above the form rather than beside the buttons,
 * because it is news about the page, not a control.
 */
export function DraftRestoredNotice() {
  const { state } = usePostAd();
  if (!state.restored || state.submitted) return null;

  const dropped = state.droppedFiles;

  return (
    <p
      role="status"
      data-draft-restored
      className="rounded-sm border border-line bg-surface-sunken p-3 text-sm leading-relaxed text-fg-muted"
    >
      We have restored the draft saved on this device.
      {dropped > 0 ? (
        <>
          {' '}
          {dropped === 1
            ? 'The file you had chosen needs selecting again — browsers cannot keep a file between visits.'
            : `The ${dropped} files you had chosen need selecting again — browsers cannot keep files between visits.`}
        </>
      ) : null}
    </p>
  );
}
