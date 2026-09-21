import type { AdvertisementType } from '@/config/ad-types';
import { DEFAULT_PACKAGE_ID } from '@/config/packages';
import {
  classifiedSubmissionSchema,
  collectErrors,
  displaySubmissionSchema,
  type FieldErrors,
} from '@/lib/post-ad/schema';
import { ownsField, stepsFor, type StepDefinition } from '@/lib/post-ad/steps';
import type {
  AdvertisementSubmission,
  ContactInformation,
  SubmissionImage,
  SubmissionResult,
} from '@/types/submission';

/**
 * Form state and the reducer over it.
 *
 * Deliberately separate from both the UI and the schema. The components read
 * this state and dispatch to it; the schema knows nothing about steps or
 * touched fields; this module knows nothing about React beyond the shape of a
 * reducer. Each can be changed without disturbing the others.
 *
 * Both branches are kept side by side rather than one discriminated blob, so
 * an advertiser who starts a classified, changes their mind and then changes
 * back does not find their typing gone.
 */

export interface ClassifiedValues {
  categorySlug: string;
  title: string;
  description: string;
  locationSlug: string;
  price: string;
  categorySpecificData: Record<string, string>;
  contact: ContactInformation;
  packageId: string;
}

export interface DisplayValues {
  organisationName: string;
  title: string;
  description: string;
  locationSlug: string;
  website: string;
  notes: string;
  contact: ContactInformation;
}

export interface PostAdState {
  advertisementType: AdvertisementType | null;
  stepIndex: number;
  /**
   * The furthest step reached so far.
   *
   * Once an advertiser has been through a step it stays reachable, so going
   * back from the preview to fix a typo does not mean pressing Continue four
   * times to return. Reachable is not the same as valid: Continue still
   * refuses to leave a step with errors.
   */
  maxStepReached: number;
  classified: ClassifiedValues;
  display: DisplayValues;
  /** Photographs for a classified advertisement. */
  images: SubmissionImage[];
  /** Artwork files for a display request. */
  artwork: SubmissionImage[];
  /** Errors are shown only once a field has been touched or a step attempted. */
  touched: Record<string, boolean>;
  /** Set when Continue is pressed on an invalid step. */
  stepAttempted: boolean;
  /** Errors reported by the file picker, kept out of the schema. */
  fileError: string | null;
  submitted: SubmissionResult | null;
  submitting: boolean;
  draftSavedAt: string | null;
  /** True once anything has been entered, for the unsaved-changes warning. */
  dirty: boolean;
  /** Set when a saved draft was restored, so the page can say so. */
  restored: boolean;
  /**
   * How many files the restored draft had to drop. Part of the state rather
   * than a component's own, so restoring is one update instead of a render
   * that then sets more state.
   */
  droppedFiles: number;
}

const EMPTY_CONTACT: ContactInformation = {
  name: '',
  phone: '',
  whatsapp: '',
  email: '',
  showPhonePublicly: true,
  allowWhatsApp: true,
};

export function initialState(): PostAdState {
  return {
    advertisementType: null,
    stepIndex: 0,
    maxStepReached: 0,
    classified: {
      categorySlug: '',
      title: '',
      description: '',
      locationSlug: '',
      price: '',
      categorySpecificData: {},
      contact: { ...EMPTY_CONTACT },
      packageId: DEFAULT_PACKAGE_ID,
    },
    display: {
      organisationName: '',
      title: '',
      description: '',
      locationSlug: '',
      website: '',
      notes: '',
      contact: { ...EMPTY_CONTACT },
    },
    images: [],
    artwork: [],
    touched: {},
    stepAttempted: false,
    fileError: null,
    submitted: null,
    submitting: false,
    draftSavedAt: null,
    dirty: false,
    restored: false,
    droppedFiles: 0,
  };
}

/* ------------------------------------------------------------ actions --- */

export type PostAdAction =
  | { type: 'chooseType'; value: AdvertisementType }
  | { type: 'setClassified'; key: keyof ClassifiedValues; value: string }
  | { type: 'setDisplay'; key: keyof DisplayValues; value: string }
  | { type: 'setCategoryField'; key: string; value: string }
  | { type: 'setContact'; key: keyof ContactInformation; value: string | boolean }
  | { type: 'touch'; path: string }
  | { type: 'addImages'; target: 'images' | 'artwork'; images: SubmissionImage[] }
  | { type: 'removeImage'; target: 'images' | 'artwork'; id: string }
  | { type: 'moveImage'; target: 'images' | 'artwork'; id: string; direction: -1 | 1 }
  | { type: 'makePrimary'; target: 'images' | 'artwork'; id: string }
  | { type: 'fileError'; message: string | null }
  | { type: 'goToStep'; index: number }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'attemptStep' }
  | { type: 'submitting' }
  | { type: 'submitted'; result: SubmissionResult }
  | { type: 'draftSaved'; at: string }
  | { type: 'restore'; state: PostAdState }
  | { type: 'reset' };

function touchAll(step: StepDefinition, touched: Record<string, boolean>) {
  const next = { ...touched };
  for (const field of step.fields) next[field] = true;
  return next;
}

export function reducer(state: PostAdState, action: PostAdAction): PostAdState {
  switch (action.type) {
    case 'chooseType': {
      const steps = stepsFor(action.value);
      // Straight on to the first real step; choosing is itself the answer.
      const stepIndex = Math.min(1, steps.length - 1);
      const changed = state.advertisementType !== action.value;
      return {
        ...state,
        advertisementType: action.value,
        stepIndex,
        // The two branches have different steps, so progress through one does
        // not carry into the other.
        maxStepReached: changed ? stepIndex : Math.max(state.maxStepReached, stepIndex),
        stepAttempted: false,
        dirty: true,
      };
    }

    case 'setClassified':
      return {
        ...state,
        classified: { ...state.classified, [action.key]: action.value },
        dirty: true,
      };

    case 'setDisplay':
      return {
        ...state,
        display: { ...state.display, [action.key]: action.value },
        dirty: true,
      };

    case 'setCategoryField':
      return {
        ...state,
        classified: {
          ...state.classified,
          categorySpecificData: {
            ...state.classified.categorySpecificData,
            [action.key]: action.value,
          },
        },
        dirty: true,
      };

    case 'setContact': {
      const branch = state.advertisementType === 'display' ? 'display' : 'classified';
      const current = state[branch];
      return {
        ...state,
        [branch]: { ...current, contact: { ...current.contact, [action.key]: action.value } },
        dirty: true,
      };
    }

    case 'touch':
      return { ...state, touched: { ...state.touched, [action.path]: true } };

    case 'addImages':
      return {
        ...state,
        [action.target]: [...state[action.target], ...action.images],
        fileError: null,
        dirty: true,
      };

    case 'removeImage':
      return {
        ...state,
        [action.target]: state[action.target].filter((image) => image.id !== action.id),
        dirty: true,
      };

    case 'moveImage': {
      const list = [...state[action.target]];
      const index = list.findIndex((image) => image.id === action.id);
      const target = index + action.direction;
      if (index === -1 || target < 0 || target >= list.length) return state;
      const moved = list[index] as SubmissionImage;
      const displaced = list[target] as SubmissionImage;
      list[index] = displaced;
      list[target] = moved;
      return { ...state, [action.target]: list, dirty: true };
    }

    case 'makePrimary': {
      // "Primary" is simply first, which is also the order the gallery uses.
      const list = state[action.target];
      const image = list.find((item) => item.id === action.id);
      if (!image) return state;
      return {
        ...state,
        [action.target]: [image, ...list.filter((item) => item.id !== action.id)],
        dirty: true,
      };
    }

    case 'fileError':
      return { ...state, fileError: action.message };

    case 'goToStep':
      return {
        ...state,
        stepIndex: action.index,
        maxStepReached: Math.max(state.maxStepReached, action.index),
        stepAttempted: false,
      };

    case 'next': {
      const steps = stepsFor(state.advertisementType);
      const step = steps[state.stepIndex];
      const index = Math.min(state.stepIndex + 1, steps.length - 1);
      return {
        ...state,
        stepIndex: index,
        maxStepReached: Math.max(state.maxStepReached, index),
        stepAttempted: false,
        touched: step ? touchAll(step, state.touched) : state.touched,
      };
    }

    case 'back':
      return { ...state, stepIndex: Math.max(state.stepIndex - 1, 0), stepAttempted: false };

    case 'attemptStep': {
      const steps = stepsFor(state.advertisementType);
      const step = steps[state.stepIndex];
      return {
        ...state,
        stepAttempted: true,
        touched: step ? touchAll(step, state.touched) : state.touched,
      };
    }

    case 'submitting':
      return { ...state, submitting: true };

    case 'submitted':
      // `dirty` clears so leaving the confirmation does not warn, and
      // `submitting` clears so a second click cannot start a second request.
      return { ...state, submitted: action.result, submitting: false, dirty: false };

    case 'draftSaved':
      return { ...state, draftSavedAt: action.at };

    case 'restore':
      return action.state;

    case 'reset':
      return initialState();

    default:
      return state;
  }
}

/* --------------------------------------------------------- validation --- */

/**
 * Validates the whole payload, then keeps the errors.
 *
 * One code path for field-level, step-level and final validation: a step is
 * valid when no error belongs to it. That makes it impossible for a step to
 * pass on its own terms and then fail at submission.
 */
export function validate(state: PostAdState): FieldErrors {
  if (state.advertisementType === 'display') {
    const result = displaySubmissionSchema.safeParse({
      advertisementType: 'display',
      ...state.display,
      artworkCount: state.artwork.length,
    });
    return result.success ? {} : collectErrors(result.error);
  }

  if (state.advertisementType === 'classified') {
    const result = classifiedSubmissionSchema.safeParse({
      advertisementType: 'classified',
      ...state.classified,
      imageCount: state.images.length,
    });
    return result.success ? {} : collectErrors(result.error);
  }

  return { advertisementType: 'Please choose the kind of advertisement you want.' };
}

export function errorsForStep(step: StepDefinition, errors: FieldErrors): FieldErrors {
  const own: Record<string, string> = {};
  for (const [path, message] of Object.entries(errors)) {
    if (ownsField(step, path)) own[path] = message;
  }
  return own;
}

export function isStepValid(state: PostAdState, errors: FieldErrors): boolean {
  const step = stepsFor(state.advertisementType)[state.stepIndex];
  if (!step) return false;
  return Object.keys(errorsForStep(step, errors)).length === 0;
}

/**
 * Whether an error should be on screen yet.
 *
 * Errors appear once the advertiser has left the field or pressed Continue —
 * never while they are still typing their first character.
 */
export function visibleError(
  state: PostAdState,
  errors: FieldErrors,
  path: string,
): string | undefined {
  const message = errors[path];
  if (!message) return undefined;
  const touched =
    state.stepAttempted ||
    state.touched[path] ||
    Object.keys(state.touched).some((key) => path.startsWith(`${key}.`));
  return touched ? message : undefined;
}

/* --------------------------------------------------------- submission --- */

/** Builds the submission model from form state. */
export function toSubmission(state: PostAdState): AdvertisementSubmission {
  if (state.advertisementType === 'display') {
    return {
      advertisementType: 'display',
      organisationName: state.display.organisationName,
      title: state.display.title,
      description: state.display.description,
      locationSlug: state.display.locationSlug,
      contact: state.display.contact,
      website: state.display.website,
      artwork: state.artwork,
      notes: state.display.notes,
    };
  }

  return {
    advertisementType: 'classified',
    categorySlug: state.classified.categorySlug,
    title: state.classified.title,
    description: state.classified.description,
    locationSlug: state.classified.locationSlug,
    price: state.classified.price,
    categorySpecificData: state.classified.categorySpecificData,
    contact: state.classified.contact,
    images: state.images,
    packageId: state.classified.packageId,
  };
}

/** The contact block in play for the current branch. */
export function activeContact(state: PostAdState): ContactInformation {
  return state.advertisementType === 'display'
    ? state.display.contact
    : state.classified.contact;
}
