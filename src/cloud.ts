import { InferenceMode } from 'firebase/ai';

/**
 * Thrown when App Check never answers. With reCAPTCHA Enterprise the SDK waits
 * for the reCAPTCHA script to become ready; if that script is blocked (offline,
 * ad/tracker blocker, network filter) the wait never ends, and every cloud call
 * made through Firebase AI Logic hangs with it instead of failing.
 */
export class AppCheckStuckError extends Error {
  constructor() {
    super('App Check did not return a token in time (reCAPTCHA did not load).');
    this.name = 'AppCheckStuckError';
  }
}

/** Resolves `true` if `promise` settles (either way) within `ms`, else `false`. */
export function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    const done = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    promise.then(done, done);
  });
}

/**
 * The mode to run in when the cloud cannot be used: hybrid modes degrade to
 * on-device only (which fails loudly if Gemini Nano is missing), while
 * "Only cloud" has nothing to fall back to.
 */
export function modeWithoutCloud(mode: InferenceMode): InferenceMode | null {
  return mode === InferenceMode.ONLY_IN_CLOUD ? null : InferenceMode.ONLY_ON_DEVICE;
}
