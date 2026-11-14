import type { AppCheck } from 'firebase/app-check';
import {
  describeAvailability,
  describeBrowser,
  cloudHint,
  environmentFixes,
  MIN_CHROME_MAJOR,
  type AppCheckState,
  type BrowserInfo,
  type EnvSnapshot,
} from './gate-env';
import { createInferenceLock, type GateCtx } from './gate-ctx';
import { $, el, setChildren, statusRow } from './gate-dom';
import { allowsCloud, type GateFirebase } from './gate-firebase';
import type { DeviceAvailability, RouteInput } from './routing';

/** Everything the shell needs from the outside, so tests can drive it. */
export interface ShellDeps {
  fb: GateFirebase;
  browser: BrowserInfo;
  probe: () => Promise<{ languageModelExists: boolean; availability: DeviceAvailability }>;
  /** Whether the SDK attached its on-device adapter. */
  adapterAttached: () => boolean;
  /** Runs `initializeDeviceModel`; must be called synchronously from the click. */
  prepare: (onProgress: (fraction: number) => void) => Promise<void>;
  appCheckResponds: (appCheck: AppCheck, timeoutMs: number) => Promise<boolean>;
  appCheckWaitMs: number;
  /** Re-probe interval while the model is downloading. */
  pollMs: number;
  isOnline: () => boolean;
}

export interface Shell {
  ctx: GateCtx;
  /** Re-reads availability and the adapter, then re-renders. */
  refresh: () => Promise<void>;
  /** Renders, runs the first probe and the App Check wait. Call after the sections are wired. */
  start: () => void;
}

const APP_CHECK_TEXT: Record<AppCheckState, [string, 'ok' | 'warn' | 'bad' | 'off']> = {
  'not-configured': ['not configured', 'off'],
  checking: ['checking…', 'warn'],
  responding: ['responding', 'ok'],
  stuck: ['not responding', 'bad'],
  error: ['init failed', 'bad'],
};

/** Announce download progress at most once per 10% step. */
export const PROGRESS_ANNOUNCE_STEP = 10;

export function initGateShell(deps: ShellDeps): Shell {
  const { fb } = deps;
  const configured = fb.kind === 'configured';
  const initError = fb.kind === 'local' ? fb.error : undefined;

  let env: EnvSnapshot = {
    browser: deps.browser,
    languageModelExists: false,
    availability: 'unknown',
    adapterAttached: false,
    online: deps.isOnline(),
    configured,
    missingConfig: fb.kind === 'local' ? fb.missing : [],
    ...(initError ? { initError } : {}),
    appCheck: configured ? 'checking' : initError ? 'error' : 'not-configured',
    probed: false,
  };

  const els = {
    rowsDevice: $('rows-device'),
    rowsCloud: $('rows-cloud'),
    stationCloud: $('station-cloud'),
    fixes: $('fixes'),
    prepare: $<HTMLButtonElement>('prepare'),
    prepareStatus: $('prepare-status'),
    progress: $('progress'),
    progressFill: $('progress-fill'),
  };

  /** Everything the routing function needs, from the current environment. */
  function routeInput(userChoice: RouteInput['userChoice']): RouteInput {
    return {
      userChoice,
      deviceAvailability: env.availability,
      adapterAttached: env.adapterAttached,
      online: env.online,
      cloudConfigured: env.configured,
      appCheckResponsive: env.appCheck === 'responding',
      appCheckChecking: env.appCheck === 'checking',
      cloudInitFailed: env.initError !== undefined,
    };
  }

  const listeners: (() => void)[] = [];
  let preparing = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  function renderEnv(): void {
    const b = env.browser;
    const chromeOk = b.name === 'Chrome' && !b.isMobile && (b.major ?? 0) >= MIN_CHROME_MAJOR;
    const avail = env.availability;
    const availTone =
      avail === 'available'
        ? 'ok'
        : avail === 'downloadable' || avail === 'downloading' || avail === 'unknown'
          ? 'warn'
          : 'bad';

    els.rowsDevice.replaceChildren(
      statusRow('Browser', describeBrowser(b), chromeOk ? 'ok' : 'bad'),
      statusRow(
        'LanguageModel API',
        env.languageModelExists ? 'present' : 'missing',
        env.languageModelExists ? 'ok' : 'bad',
      ),
      statusRow('Availability (text, English)', describeAvailability(avail), availTone),
      statusRow(
        'Firebase on-device adapter',
        env.adapterAttached ? 'attached' : 'not attached',
        env.adapterAttached ? 'ok' : 'bad',
      ),
    );

    const [acText, acTone] = APP_CHECK_TEXT[env.appCheck];
    els.rowsCloud.replaceChildren(
      statusRow('Network', env.online ? 'online' : 'offline', env.online ? 'ok' : 'warn'),
      statusRow(
        'Firebase config',
        env.configured ? 'present' : env.initError ? 'present, init failed' : 'not configured',
        env.configured ? 'ok' : env.initError ? 'bad' : 'off',
      ),
      statusRow('App Check', acText, acTone),
    );
    els.stationCloud.classList.toggle('is-off', !env.configured);

    const fixes = environmentFixes(env);
    const hint = cloudHint(env);
    setChildren(
      els.fixes,
      !env.probed
        ? [el('li', undefined, 'Checking this machine…')]
        : [
            ...(fixes.length === 0
              ? [el('li', 'fix-ok', 'Nothing to fix. Nano is ready for the test below.')]
              : fixes.map((f) => el('li', undefined, f.text))),
            ...(hint ? [el('li', 'fix-info', hint)] : []),
          ],
    );

    els.prepare.disabled = !env.languageModelExists || !env.adapterAttached || preparing;
    listeners.forEach((fn) => fn());
    schedulePoll();
  }

  /** While Chrome downloads the model, keep asking so the page unblocks by itself. */
  function schedulePoll(): void {
    const wanted = env.availability === 'downloading' && !preparing;
    if (!wanted) {
      if (pollTimer !== undefined) clearTimeout(pollTimer);
      pollTimer = undefined;
      return;
    }
    if (pollTimer !== undefined) return;
    pollTimer = setTimeout(() => {
      pollTimer = undefined;
      void refresh();
    }, deps.pollMs);
  }

  async function refresh(): Promise<void> {
    const probe = await deps.probe();
    let adapterAttached = false;
    try {
      adapterAttached = deps.adapterAttached();
    } catch (err) {
      console.warn('[LectureLoop] could not build the on-device model', err);
    }
    env = { ...env, ...probe, adapterAttached, probed: true };
    renderEnv();
  }

  // ---- Prepare Nano (must run inside the click) --------------------------------

  let lastBucket = -1;

  function showProgress(fraction: number | null): void {
    els.progress.hidden = fraction === null;
    if (fraction === null) return;
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    els.progress.setAttribute('aria-valuenow', String(pct));
    els.progressFill.style.width = `${pct}%`;
    const bucket = Math.floor(pct / PROGRESS_ANNOUNCE_STEP);
    if (bucket === lastBucket) return;
    lastBucket = bucket;
    els.prepareStatus.textContent =
      pct >= 100 ? 'Downloaded. Loading the model…' : `Downloading Gemini Nano… ${pct}%`;
  }

  els.prepare.addEventListener('click', () => {
    if (preparing) return;
    preparing = true;
    lastBucket = -1;
    els.prepare.disabled = true;
    els.prepareStatus.textContent = 'Preparing Gemini Nano…';
    // Called synchronously from the click so Chrome sees the user gesture.
    const ready = deps.prepare(showProgress);
    void ready
      .then(() => {
        els.prepareStatus.textContent = 'Gemini Nano is downloaded.';
      })
      .catch((err: unknown) => {
        console.error('[LectureLoop] prepare failed', err);
        els.prepareStatus.textContent = `Could not prepare Nano: ${err instanceof Error ? err.message : String(err)}`;
      })
      .finally(async () => {
        preparing = false;
        showProgress(null);
        await refresh();
      });
  });

  // ---- App Check ---------------------------------------------------------------

  let checkingAppCheck = false;
  /** An `online` event arrived while a wait was running. */
  let onlineDuringCheck = false;
  async function checkAppCheck(): Promise<void> {
    if (fb.kind !== 'configured' || !allowsCloud(fb) || checkingAppCheck) return;
    checkingAppCheck = true;
    onlineDuringCheck = false;
    env = { ...env, appCheck: 'checking' };
    renderEnv();
    try {
      const ok = await deps.appCheckResponds(fb.appCheck, deps.appCheckWaitMs).catch(() => false);
      env = { ...env, appCheck: ok ? 'responding' : 'stuck' };
    } finally {
      checkingAppCheck = false;
      renderEnv();
    }
    // The network came back during the wait, so the reCAPTCHA load may have failed for that reason.
    if (onlineDuringCheck && env.appCheck === 'stuck') void checkAppCheck();
  }

  function setOnline(): void {
    const wasOnline = env.online;
    env = { ...env, online: deps.isOnline() };
    renderEnv();
    if (env.online && checkingAppCheck) onlineDuringCheck = true;
    // A blocked reCAPTCHA load may just have been a dead network: try again.
    if (!wasOnline && env.online && env.appCheck === 'stuck') void checkAppCheck();
  }
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOnline);

  return {
    ctx: {
      fb,
      env: () => env,
      routeInput,
      onEnv: (fn) => (listeners.push(fn), fn()),
      inference: createInferenceLock(),
    },
    refresh,
    start: () => {
      renderEnv();
      void refresh();
      void checkAppCheck();
    },
  };
}
