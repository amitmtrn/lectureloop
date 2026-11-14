import { AIError, AIErrorCode, type InferenceMode } from 'firebase/ai';
import { toFriendlyError, type FriendlyError } from './errors';
import { CloudNotAllowedError, GradeParseError, GradeTimeoutError } from './grade';

const SEE_FIXES = 'See "What to fix" above, then press "Prepare Nano" if it is listed.';

/**
 * Error text for the gate page. The main page's messages talk about modes this page does not
 * have, so the ones that would mislead here are replaced.
 */
export function gateFriendlyError(err: unknown, mode: InferenceMode): FriendlyError {
  if (err instanceof GradeParseError) {
    return {
      title: 'The model answered, but not in a readable format',
      detail: `${err.message} Press Grade again.`,
    };
  }
  if (err instanceof GradeTimeoutError) {
    return {
      title: 'The model took too long',
      detail: `${err.message} Try again. If it keeps happening, check chrome://on-device-internals or reload the page.`,
    };
  }
  if (err instanceof CloudNotAllowedError) {
    return {
      title: 'The cloud is not available',
      detail: `Firebase is not configured or failed to initialize. ${SEE_FIXES}`,
    };
  }
  const friendly = toFriendlyError(err, mode);
  if (friendly.showChromeSetup) return { ...friendly, detail: SEE_FIXES };
  if (err instanceof AIError && err.code === AIErrorCode.FETCH_ERROR) {
    return {
      ...friendly,
      detail: 'Check your connection, or choose "Device only" to run on this laptop.',
    };
  }
  return friendly;
}
