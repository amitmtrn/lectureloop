import { initializeApp } from 'firebase/app';
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { settlesWithin } from './cloud';
import { appCheckDebugToken, readConfig } from './config';

declare global {
  // App Check reads this global before initializeAppCheck() runs.
  // `true` makes the SDK generate a debug token and log it to the console.
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

export type FirebaseStatus =
  | { ready: true; ai: AI; appCheck: AppCheck }
  | { ready: false; missing: string[] }
  | { ready: false; missing: []; error: string };

function init(): FirebaseStatus {
  // List each var explicitly: passing `import.meta.env` as a whole would make
  // Vite inline every VITE_* var (including the debug token) into the bundle.
  const config = readConfig({
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY,
  });
  if (!config.ok) return { ready: false, missing: config.missing };

  try {
    const app = initializeApp(config.firebaseOptions);

    // Debug provider for localhost. `import.meta.env.DEV` is statically false in
    // production builds, so this whole branch (and the env token) is stripped.
    if (import.meta.env.DEV) {
      const debugToken = appCheckDebugToken(true, import.meta.env.VITE_APPCHECK_DEBUG_TOKEN);
      if (debugToken !== undefined) self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    }

    // App Check must be initialized before any AI Logic call.
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(config.recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });

    const ai = getAI(app, { backend: new GoogleAIBackend() });
    return { ready: true, ai, appCheck };
  } catch (err) {
    console.error('Firebase initialization failed', err);
    return {
      ready: false,
      missing: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const firebaseStatus: FirebaseStatus = init();

/**
 * Whether App Check answers at all within `timeoutMs`. A *failed* token
 * exchange still counts: the SDK then sends a placeholder token and the backend
 * decides. Only a request that never settles (reCAPTCHA script blocked) makes
 * cloud calls hang, which is what callers need to know.
 */
export function appCheckResponds(appCheck: AppCheck, timeoutMs: number): Promise<boolean> {
  return settlesWithin(getToken(appCheck), timeoutMs);
}
