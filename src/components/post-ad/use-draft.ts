'use client';

import { useEffect, useRef, type Dispatch } from 'react';

import { clearDraft, loadDraft, saveDraft } from '@/lib/post-ad/draft';
import { releaseImages } from '@/lib/post-ad/images';
import type { PostAdAction, PostAdState } from '@/lib/post-ad/state';

/**
 * Draft lifecycle: restore, autosave, clear and release.
 *
 * Separate from the Save Draft button on purpose. The button only appears
 * once an advertiser is past the first step, and these effects must run from
 * the moment the page mounts — otherwise a draft saved on step five would
 * never be restored, because the component holding the effect would not be on
 * screen to run it. Lifecycle belongs to the page; the button is just a
 * control.
 */
export function usePostAdDraft(state: PostAdState, dispatch: Dispatch<PostAdAction>) {
  const restored = useRef(false);
  // Kept in a ref so the unmount cleanup can release the latest files without
  // the cleanup effect re-running on every change — which would revoke URLs
  // that are still on screen.
  const files = useRef({ images: state.images, artwork: state.artwork });

  useEffect(() => {
    files.current = { images: state.images, artwork: state.artwork };
  }, [state.images, state.artwork]);

  // Restore once. `localStorage` cannot be read while rendering on the
  // server, so this has to be an effect rather than a lazy initial state.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const draft = loadDraft();
    if (draft) dispatch({ type: 'restore', state: draft.state });
  }, [dispatch]);

  // Autosave a second after typing stops, so a refresh costs nothing.
  useEffect(() => {
    if (!state.dirty || state.submitted) return;
    const timer = setTimeout(() => {
      const at = saveDraft(state);
      if (at) dispatch({ type: 'draftSaved', at });
    }, 1000);
    return () => clearTimeout(timer);
  }, [state, dispatch]);

  // A submitted advertisement must not return as a draft on the next visit.
  useEffect(() => {
    if (state.submitted) clearDraft();
  }, [state.submitted]);

  // Release every object URL when the page goes away.
  useEffect(() => {
    const held = files;
    return () => {
      releaseImages(held.current.images);
      releaseImages(held.current.artwork);
    };
  }, []);
}
