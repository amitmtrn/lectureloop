import { AIError, AIErrorCode, InferenceMode } from 'firebase/ai';
import { StudyPackParseError } from './parse';

export interface FriendlyError {
  title: string;
  detail: string;
  /** Show the Chrome on-device setup checklist. */
  showChromeSetup?: boolean;
}

const ON_DEVICE_MARKERS = [
  'Local LanguageModel API not available',
  'on-device model is not available',
  'Chrome AI requested for unsupported browser',
];

export function toFriendlyError(err: unknown, mode: InferenceMode): FriendlyError {
  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof StudyPackParseError) {
    return {
      title: 'The model returned something we could not read',
      detail: `${message} Try again, or try a shorter excerpt.`,
    };
  }

  const onDeviceUnavailable = ON_DEVICE_MARKERS.some((m) => message.includes(m));
  if (
    onDeviceUnavailable ||
    (mode === InferenceMode.ONLY_ON_DEVICE &&
      err instanceof AIError &&
      (err.code === AIErrorCode.UNSUPPORTED || err.code === AIErrorCode.API_NOT_ENABLED))
  ) {
    return {
      title: 'Gemini Nano is not available in this browser',
      detail:
        mode === InferenceMode.ONLY_ON_DEVICE
          ? '"Only on-device" mode needs Chrome\'s built-in model. Set it up as below, or switch to "Prefer on-device" to fall back to the cloud.'
          : "Chrome's built-in model is not ready. Set it up as below, or use a cloud mode.",
      showChromeSetup: true,
    };
  }

  if (/app ?check/i.test(message)) {
    return {
      title: 'App Check blocked the request',
      detail:
        'On localhost, register the debug token printed in the browser console under Firebase console > App Check > Manage debug tokens. In production, check your reCAPTCHA Enterprise site key and allowed domains.',
    };
  }

  if (err instanceof AIError && err.code === AIErrorCode.API_NOT_ENABLED) {
    return {
      title: 'Firebase AI Logic is not enabled',
      detail:
        'Enable Firebase AI Logic (Gemini Developer API) for this project in the Firebase console, wait a minute, then retry.',
    };
  }

  if (err instanceof AIError && err.code === AIErrorCode.FETCH_ERROR) {
    return {
      title: 'Could not reach the cloud model',
      detail:
        'Check your connection and try again. "Prefer on-device" works offline once Gemini Nano is downloaded.',
    };
  }

  return { title: 'Something went wrong', detail: message };
}
