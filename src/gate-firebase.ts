import { initializeApp, type FirebaseOptions } from 'firebase/app';
import type { AppCheck } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import type { FirebaseStatus } from './firebase';

/**
 * Clearly fake options so the AI Logic SDK can build a model for ONLY_ON_DEVICE without a Firebase
 * project. The SDK only checks that apiKey, projectId and appId are present. Nothing here
 * identifies a real project, and no request is ever made with it (see design.md).
 */
export const LOCAL_PLACEHOLDER_OPTIONS: FirebaseOptions = {
  apiKey: 'local-placeholder-not-a-real-key',
  projectId: 'lectureloop-local-placeholder',
  appId: '1:000000000000:web:localplaceholder',
};

export const LOCAL_APP_NAME = 'lectureloop-gate-local';

export type GateFirebase =
  | { kind: 'configured'; ai: AI; appCheck: AppCheck }
  | { kind: 'local'; ai: AI; missing: string[]; error?: string };

/** No App Check, no cloud: only usable with ONLY_ON_DEVICE. */
export function createLocalAI(): AI {
  const app = initializeApp(LOCAL_PLACEHOLDER_OPTIONS, LOCAL_APP_NAME);
  return getAI(app, { backend: new GoogleAIBackend() });
}

/** Uses the real (App Check protected) setup when configured, otherwise the local placeholder. */
export function initGateFirebase(status: FirebaseStatus): GateFirebase {
  if (status.ready) return { kind: 'configured', ai: status.ai, appCheck: status.appCheck };
  const error = 'error' in status ? status.error : undefined;
  return {
    kind: 'local',
    ai: createLocalAI(),
    missing: status.missing,
    ...(error ? { error } : {}),
  };
}

export const allowsCloud = (fb: GateFirebase): boolean => fb.kind === 'configured';
