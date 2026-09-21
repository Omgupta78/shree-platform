'use client';

import { useEffect } from 'react';

import { usePostAd } from '@/components/post-ad/form-provider';

/**
 * Warns before losing a half-written advertisement.
 *
 * Only `beforeunload`, and only while there is something to lose. That covers
 * closing the tab, reloading and typing a new address — the ways work is
 * actually lost. It deliberately does not intercept in-app navigation: the
 * draft is already saved on this device, so a reader who clicks through to
 * the classifieds and comes back finds their typing waiting, and a
 * confirmation dialog on every internal link would be exactly the nuisance
 * the brief warns against.
 *
 * The warning stops the moment the advertisement is submitted, so nobody is
 * challenged on the way out of the confirmation screen.
 */
export function UnsavedChangesGuard() {
  const { state } = usePostAd();
  const active = state.dirty && !state.submitted;

  useEffect(() => {
    if (!active) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      // Browsers show their own wording; assigning returnValue is what asks.
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);

  return null;
}
