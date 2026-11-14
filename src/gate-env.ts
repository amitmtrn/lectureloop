import { ON_DEVICE_CREATE_OPTIONS } from './grade';
import type { DeviceAvailability } from './routing';

export type AppCheckState = 'not-configured' | 'checking' | 'responding' | 'stuck' | 'error';

export interface BrowserInfo {
  name: string;
  /** Major version, null when it cannot be read. */
  major: number | null;
  isMobile: boolean;
}

export interface EnvSnapshot {
  browser: BrowserInfo;
  languageModelExists: boolean;
  availability: DeviceAvailability;
  adapterAttached: boolean;
  online: boolean;
  /** The cloud is usable: config present and the real Firebase app (with App Check) was built. */
  configured: boolean;
  missingConfig: string[];
  /** Config is present but Firebase initialization threw; the page runs on the placeholder app. */
  initError?: string;
  appCheck: AppCheckState;
  /** The first availability probe has finished. */
  probed: boolean;
}

export const MIN_CHROME_MAJOR = 139;

interface Brand {
  brand: string;
  version: string;
}

/** Reads browser name and major version from userAgentData brands, falling back to the UA string. */
export function parseBrowser(userAgent: string, brands?: readonly Brand[]): BrowserInfo {
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(userAgent);
  const major = (v: string | undefined): number | null => {
    const n = Number.parseInt(v ?? '', 10);
    return Number.isFinite(n) ? n : null;
  };

  const chrome = brands?.find((b) => b.brand === 'Google Chrome');
  if (chrome) return { name: 'Chrome', major: major(chrome.version), isMobile };
  const other = brands?.find((b) => /edge|opera|brave|vivaldi|samsung/i.test(b.brand));
  if (other)
    return {
      name: other.brand,
      major: major(brands?.find((b) => b.brand === 'Chromium')?.version),
      isMobile,
    };

  const edge = /Edg\/(\d+)/.exec(userAgent);
  if (edge) return { name: 'Microsoft Edge', major: major(edge[1]), isMobile };
  const opera = /OPR\/(\d+)/.exec(userAgent);
  if (opera) return { name: 'Opera', major: major(opera[1]), isMobile };
  const firefox = /Firefox\/(\d+)/.exec(userAgent);
  if (firefox) return { name: 'Firefox', major: major(firefox[1]), isMobile };
  const chromeUa = /(?:Chrome|CriOS)\/(\d+)/.exec(userAgent);
  if (chromeUa) return { name: 'Chrome', major: major(chromeUa[1]), isMobile };
  if (/Safari\//.test(userAgent)) {
    return { name: 'Safari', major: major(/Version\/(\d+)/.exec(userAgent)?.[1]), isMobile };
  }
  return { name: 'Unknown browser', major: null, isMobile };
}

export function describeBrowser(b: BrowserInfo): string {
  return b.major === null ? b.name : `${b.name} ${b.major}`;
}

export function describeAvailability(a: DeviceAvailability): string {
  return a === 'api-missing' ? 'API missing' : a === 'unknown' ? 'not checked' : a;
}

export interface Fix {
  id: string;
  text: string;
}

export const REQUIREMENTS_TEXT =
  'Needs about 22 GB free disk, and 16 GB RAM with 4 or more CPU cores, or more than 4 GB of GPU VRAM. Check chrome://on-device-internals.';

/** The exact fixes for whatever is missing. Empty when nothing needs fixing for the device path. */
export function environmentFixes(env: EnvSnapshot): Fix[] {
  const fixes: Fix[] = [];
  const { browser } = env;

  if (browser.isMobile) {
    fixes.push({
      id: 'desktop',
      text: 'Use desktop Chrome 139 or newer. Mobile Chrome has no Gemini Nano.',
    });
  } else if (browser.name !== 'Chrome') {
    fixes.push({
      id: 'browser',
      text: `This is ${describeBrowser(browser)}. Use desktop Chrome 139 or newer.`,
    });
  } else if (browser.major !== null && browser.major < MIN_CHROME_MAJOR) {
    fixes.push({
      id: 'version',
      text: `Chrome ${browser.major} is too old. Update to Chrome ${MIN_CHROME_MAJOR} or newer (desktop).`,
    });
  }

  if (!env.probed) {
    // Device API state is not known yet; do not guess.
  } else if (!env.languageModelExists) {
    fixes.push({
      id: 'flag',
      text: 'Enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input, then relaunch Chrome.',
    });
  } else {
    if (env.availability === 'unknown') {
      fixes.push({
        id: 'probe-failed',
        text: 'Could not read the Gemini Nano availability (LanguageModel.availability threw). Reload the page and check the browser console.',
      });
    } else if (env.availability === 'unavailable') {
      fixes.push({ id: 'hardware', text: `Gemini Nano is unavailable here. ${REQUIREMENTS_TEXT}` });
    } else if (env.availability === 'downloadable') {
      fixes.push({
        id: 'download',
        text: 'Press "Prepare Nano" to download the model (about 22 GB of free disk is required).',
      });
    } else if (env.availability === 'downloading') {
      fixes.push({
        id: 'downloading',
        text: 'The model is downloading. Wait for it to finish; progress is at chrome://on-device-internals.',
      });
    }
    if (!env.adapterAttached) {
      fixes.push({
        id: 'adapter',
        text: 'LanguageModel exists but the Firebase SDK did not attach its on-device adapter. Reload the page.',
      });
    }
  }

  if (!env.online) {
    fixes.push({
      id: 'offline',
      text: 'You are offline. The cloud path is unavailable; the on-device path is unaffected.',
    });
  }
  if (env.initError !== undefined || env.appCheck === 'error') {
    fixes.push({
      id: 'appcheck-init',
      text: `Firebase failed to initialize${env.initError ? `: ${env.initError}` : ''}. Check the VITE_* values and the browser console. The cloud is disabled; on-device still works.`,
    });
  } else if (!env.configured) {
    fixes.push({
      id: 'config',
      text: `Cloud is not configured${env.missingConfig.length ? ` (missing ${env.missingConfig.join(', ')})` : ''}. On-device still works. See docs/SETUP-FIREBASE.md to enable the cloud.`,
    });
  } else if (env.appCheck === 'stuck') {
    fixes.push({
      id: 'appcheck',
      text: 'App Check did not answer: the reCAPTCHA script did not load. Check ad blockers and network filters. Cloud calls are disabled.',
    });
  }
  return fixes;
}

interface LanguageModelGlobal {
  availability(options?: unknown): Promise<string>;
}

/** Read-only diagnostics: never generates text. Uses the SDK's text-only English options. */
export async function probeAvailability(): Promise<{
  languageModelExists: boolean;
  availability: DeviceAvailability;
}> {
  const lm = (globalThis as { LanguageModel?: LanguageModelGlobal }).LanguageModel;
  if (!lm) return { languageModelExists: false, availability: 'api-missing' };
  try {
    const result = await lm.availability(ON_DEVICE_CREATE_OPTIONS);
    const known = ['unavailable', 'downloadable', 'downloading', 'available'] as const;
    const availability = known.find((k) => k === result) ?? 'unknown';
    return { languageModelExists: true, availability };
  } catch (err) {
    console.warn('[LectureLoop] LanguageModel.availability failed', err);
    return { languageModelExists: true, availability: 'unknown' };
  }
}

export function probeBrowser(): BrowserInfo {
  const uad = (navigator as { userAgentData?: { brands?: Brand[] } }).userAgentData;
  return parseBrowser(navigator.userAgent, uad?.brands);
}
