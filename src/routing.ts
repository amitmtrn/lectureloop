import { InferenceMode } from 'firebase/ai';

export type UserChoice = 'auto' | 'device' | 'cloud';
export type DeviceAvailability =
  'unavailable' | 'downloadable' | 'downloading' | 'available' | 'api-missing' | 'unknown';
export type ExpectedPath = 'on_device' | 'in_cloud' | 'none';
export type ActualPath = 'on_device' | 'in_cloud' | 'unknown';

export interface RouteInput {
  userChoice: UserChoice;
  deviceAvailability: DeviceAvailability;
  adapterAttached: boolean;
  online: boolean;
  cloudConfigured: boolean;
  appCheckResponsive: boolean;
  /** App Check has not answered yet but the wait is not over. */
  appCheckChecking?: boolean;
  /** Config is present but Firebase initialization threw. */
  cloudInitFailed?: boolean;
}

export interface RoutePlan {
  mode: InferenceMode | null;
  expectedPath: ExpectedPath;
  reason: string;
}

function deviceBlocker(input: RouteInput): string | null {
  if (input.deviceAvailability === 'api-missing') {
    return 'Chrome has no LanguageModel API (use desktop Chrome 139+ and enable the Prompt API flag)';
  }
  if (!input.adapterAttached) return 'the Firebase SDK did not attach its on-device adapter';
  switch (input.deviceAvailability) {
    case 'available':
      return null;
    case 'downloadable':
      return 'Gemini Nano is not downloaded yet (press "Prepare Nano")';
    case 'downloading':
      return 'Gemini Nano is still downloading';
    case 'unavailable':
      return 'Gemini Nano is unavailable on this machine';
    default:
      return 'Gemini Nano status is not known yet';
  }
}

function cloudBlocker(input: RouteInput): string | null {
  if (!input.cloudConfigured) {
    return input.cloudInitFailed ? 'Firebase failed to initialize' : 'Firebase is not configured';
  }
  if (!input.online) return 'the browser is offline';
  if (!input.appCheckResponsive && input.appCheckChecking) {
    return 'App Check is still being checked (try again in a few seconds)';
  }
  if (!input.appCheckResponsive) return 'App Check is not responding (reCAPTCHA did not load)';
  return null;
}

const blocked = (reason: string): RoutePlan => ({
  mode: null,
  expectedPath: 'none',
  reason: `Blocked: ${reason}.`,
});

/** Decides how a grade request should run. Pure: no browser or SDK access. */
export function planRoute(input: RouteInput): RoutePlan {
  const deviceWhy = deviceBlocker(input);
  const cloudWhy = cloudBlocker(input);

  switch (input.userChoice) {
    case 'device':
      return deviceWhy === null
        ? {
            mode: InferenceMode.ONLY_ON_DEVICE,
            expectedPath: 'on_device',
            reason: 'Device only: runs on this laptop.',
          }
        : blocked(`on-device was chosen but ${deviceWhy}`);
    case 'cloud':
      return cloudWhy === null
        ? {
            mode: InferenceMode.ONLY_IN_CLOUD,
            expectedPath: 'in_cloud',
            reason: 'Cloud only: runs in Gemini through Firebase AI Logic.',
          }
        : blocked(`cloud was chosen but ${cloudWhy}`);
    case 'auto':
      if (deviceWhy === null) {
        return cloudWhy === null
          ? {
              mode: InferenceMode.PREFER_ON_DEVICE,
              expectedPath: 'on_device',
              reason: 'Auto: Nano is ready, so it runs on-device. The cloud is the fallback.',
            }
          : {
              mode: InferenceMode.ONLY_ON_DEVICE,
              expectedPath: 'on_device',
              reason: `Auto: runs on-device only because ${cloudWhy}.`,
            };
      }
      return cloudWhy === null
        ? {
            mode: InferenceMode.ONLY_IN_CLOUD,
            expectedPath: 'in_cloud',
            reason: `Auto: runs in the cloud because ${deviceWhy}.`,
          }
        : blocked(
            `on-device is not ready because ${deviceWhy}, and the cloud is not usable because ${cloudWhy}`,
          );
  }
}

export interface PathCheck {
  actual: ActualPath;
  mismatch: boolean;
  message: string;
}

/** Classifies the path that actually ran, from the response's `inferenceSource`. */
export function classifyPath(expected: ExpectedPath, inferenceSource: unknown): PathCheck {
  const actual: ActualPath =
    inferenceSource === 'on_device' || inferenceSource === 'in_cloud' ? inferenceSource : 'unknown';
  if (actual === 'unknown') {
    return {
      actual,
      mismatch: true,
      message: 'The SDK did not report where this ran (inferenceSource missing).',
    };
  }
  if (expected === 'none') {
    return {
      actual,
      mismatch: true,
      message: `Ran ${label(actual)} although the plan was blocked.`,
    };
  }
  if (actual !== expected) {
    return {
      actual,
      mismatch: true,
      message: `Expected ${label(expected)} but it ran ${label(actual)}.`,
    };
  }
  return { actual, mismatch: false, message: `Ran ${label(actual)} as planned.` };
}

function label(path: 'on_device' | 'in_cloud'): string {
  return path === 'on_device' ? 'on-device' : 'in the cloud';
}
