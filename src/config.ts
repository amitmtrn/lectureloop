import type { FirebaseOptions } from 'firebase/app';

/**
 * The subset of env vars LectureLoop reads. Kept as an explicit shape (rather
 * than passing `import.meta.env` around) so Vite only inlines the vars we name,
 * and so the logic is testable without Vite.
 */
export interface LectureLoopEnv {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?: string;
}

export const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_RECAPTCHA_ENTERPRISE_SITE_KEY',
] as const satisfies readonly (keyof LectureLoopEnv)[];

export type ConfigResult =
  | { ok: true; firebaseOptions: FirebaseOptions; recaptchaSiteKey: string }
  | { ok: false; missing: string[] };

/** Values copied verbatim from .env.example count as "not configured". */
function isPlaceholder(value: string): boolean {
  return /^your[-_]/i.test(value);
}

export function readConfig(env: LectureLoopEnv): ConfigResult {
  const value = (key: keyof LectureLoopEnv): string => (env[key] ?? '').trim();

  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const v = value(key);
    return v === '' || isPlaceholder(v);
  });
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    firebaseOptions: {
      apiKey: value('VITE_FIREBASE_API_KEY'),
      authDomain: value('VITE_FIREBASE_AUTH_DOMAIN'),
      projectId: value('VITE_FIREBASE_PROJECT_ID'),
      storageBucket: value('VITE_FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: value('VITE_FIREBASE_MESSAGING_SENDER_ID'),
      appId: value('VITE_FIREBASE_APP_ID'),
    },
    recaptchaSiteKey: value('VITE_RECAPTCHA_ENTERPRISE_SITE_KEY'),
  };
}

/**
 * Value for `self.FIREBASE_APPCHECK_DEBUG_TOKEN`, or `undefined` when the debug
 * provider must stay off. Only ever returns something in dev builds.
 */
export function appCheckDebugToken(
  isDev: boolean,
  envToken: string | undefined,
): string | true | undefined {
  if (!isDev) return undefined;
  const token = (envToken ?? '').trim();
  return token === '' ? true : token;
}
