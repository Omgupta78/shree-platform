import { initialState, type PostAdState } from '@/lib/post-ad/state';
import { stepsFor } from '@/lib/post-ad/steps';
import { isAdvertisementType } from '@/config/ad-types';

/**
 * Draft storage.
 *
 * `localStorage`, deliberately: a draft is one person's half-written
 * advertisement on one device, it must survive an accidental refresh or a
 * closed tab, and no server exists yet to hold it. When accounts arrive this
 * becomes a `submission_drafts` row keyed by user, and this module keeps its
 * signature.
 *
 * What is NOT kept:
 *
 *  - Files. A browser cannot reconstruct a `File` it was not handed by a user
 *    gesture, so images would come back broken. Only the count is kept, so the
 *    advertiser can be told their photographs need choosing again.
 *  - Anything about the advertiser beyond the contact block they typed for
 *    publication. No identifiers, no timestamps of behaviour, nothing derived.
 *
 * Every access is wrapped: storage throws in private mode in some browsers,
 * and a draft is a convenience — losing it must never break the page.
 */

const KEY = 'shree-classified:post-ad-draft';
const VERSION = 2;

export interface DraftEnvelope {
  version: number;
  savedAt: string;
  stepId: string;
  advertisementType: string | null;
  classified: PostAdState['classified'];
  display: PostAdState['display'];
  imageCount: number;
  artworkCount: number;
}

export interface RestoredDraft {
  state: PostAdState;
  savedAt: string;
  /** Photographs the advertiser had added but which cannot be restored. */
  droppedFiles: number;
}

export function saveDraft(state: PostAdState): string | null {
  if (typeof window === 'undefined') return null;

  const steps = stepsFor(state.advertisementType);
  const savedAt = new Date().toISOString();
  const envelope: DraftEnvelope = {
    version: VERSION,
    savedAt,
    stepId: steps[state.stepIndex]?.id ?? 'type',
    advertisementType: state.advertisementType,
    classified: state.classified,
    display: state.display,
    imageCount: state.images.length,
    artworkCount: state.artwork.length,
  };

  try {
    window.localStorage.setItem(KEY, JSON.stringify(envelope));
    return savedAt;
  } catch {
    return null;
  }
}

export function loadDraft(): RestoredDraft | null {
  if (typeof window === 'undefined') return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let envelope: Partial<DraftEnvelope>;
  try {
    envelope = JSON.parse(raw) as Partial<DraftEnvelope>;
  } catch {
    // Corrupt or hand-edited. Drop it rather than guess.
    clearDraft();
    return null;
  }

  // A draft written by an older build may not match the current fields, and a
  // half-migrated form is worse than a fresh one.
  if (envelope.version !== VERSION) {
    clearDraft();
    return null;
  }

  const base = initialState();
  const type =
    typeof envelope.advertisementType === 'string' && isAdvertisementType(envelope.advertisementType)
      ? envelope.advertisementType
      : null;

  const droppedFiles = (envelope.imageCount ?? 0) + (envelope.artworkCount ?? 0);

  const state: PostAdState = {
    ...base,
    advertisementType: type,
    classified: { ...base.classified, ...(envelope.classified ?? {}) },
    display: { ...base.display, ...(envelope.display ?? {}) },
    dirty: false,
    restored: true,
    droppedFiles,
    draftSavedAt: typeof envelope.savedAt === 'string' ? envelope.savedAt : null,
  };

  const steps = stepsFor(type);
  const stepIndex = steps.findIndex((step) => step.id === envelope.stepId);
  // Never resume on the preview: the advertiser would be looking at a preview
  // missing the images the draft could not keep.
  const lastEditable = Math.max(steps.length - 2, 0);
  state.stepIndex = stepIndex === -1 ? 0 : Math.min(stepIndex, lastEditable);
  // Everything up to where they had got to stays reachable after a restore.
  state.maxStepReached = state.stepIndex;

  return { state, savedAt: state.draftSavedAt ?? '', droppedFiles };
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do; the draft simply outlives the session.
  }
}

/** True when a draft worth offering exists. */
export function hasDraft(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
