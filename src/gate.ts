import './gate.css';
import { hasOnDeviceAdapter } from './ai';
import { appCheckResponds, firebaseStatus } from './firebase';
import {
  describeAvailability,
  describeBrowser,
  environmentFixes,
  MIN_CHROME_MAJOR,
  probeAvailability,
  probeBrowser,
  type AppCheckState,
  type EnvSnapshot,
} from './gate-env';
import { $, el, statusRow } from './gate-dom';
import { allowsCloud, initGateFirebase } from './gate-firebase';
import { getGradeModel, prepareGradeDevice } from './grade';
import { InferenceMode } from 'firebase/ai';
import type { RouteInput } from './routing';

const APP_CHECK_WAIT_MS = 8000;

const fb = initGateFirebase(firebaseStatus);
const configured = fb.kind === 'configured';

let env: EnvSnapshot = {
  browser: probeBrowser(),
  languageModelExists: false,
  availability: 'unknown',
  adapterAttached: false,
  online: navigator.onLine,
  configured,
  missingConfig: fb.kind === 'local' ? fb.missing : [],
  appCheck: configured ? 'checking' : fb.kind === 'local' && fb.error ? 'error' : 'not-configured',
};

/** Everything the routing function needs, from the current environment. */
export function currentRouteInput(userChoice: RouteInput['userChoice']): RouteInput {
  return {
    userChoice,
    deviceAvailability: env.availability,
    adapterAttached: env.adapterAttached,
    online: env.online,
    cloudConfigured: env.configured,
    appCheckResponsive: env.appCheck === 'responding',
  };
}

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

const APP_CHECK_TEXT: Record<AppCheckState, [string, 'ok' | 'warn' | 'bad' | 'off']> = {
  'not-configured': ['not configured', 'off'],
  checking: ['checking…', 'warn'],
  responding: ['responding', 'ok'],
  stuck: ['not responding', 'bad'],
  error: ['init failed', 'bad'],
};

const listeners: (() => void)[] = [];
export function onEnvChange(fn: () => void): void {
  listeners.push(fn);
}

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
      env.configured ? 'present' : 'not configured',
      env.configured ? 'ok' : 'off',
    ),
    statusRow('App Check', acText, acTone),
  );
  els.stationCloud.classList.toggle('is-off', !env.configured);

  const fixes = environmentFixes(env);
  els.fixes.replaceChildren(
    ...(fixes.length === 0
      ? [el('li', 'fix-ok', 'Nothing to fix. Nano is ready for the test below.')]
      : fixes.map((f) => el('li', undefined, f.text))),
  );

  els.prepare.disabled = !env.languageModelExists || !env.adapterAttached || preparing;
  listeners.forEach((fn) => fn());
}

export async function refreshAvailability(): Promise<void> {
  const probe = await probeAvailability();
  let adapterAttached = false;
  try {
    adapterAttached = hasOnDeviceAdapter(getGradeModel(fb.ai, InferenceMode.ONLY_ON_DEVICE));
  } catch (err) {
    console.warn('[LectureLoop] could not build the on-device model', err);
  }
  env = { ...env, ...probe, adapterAttached };
  renderEnv();
}

// ---- Prepare Nano (must run inside the click) --------------------------------

let preparing = false;

function showProgress(fraction: number | null): void {
  els.progress.hidden = fraction === null;
  if (fraction === null) return;
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  els.progress.setAttribute('aria-valuenow', String(pct));
  els.progressFill.style.width = `${pct}%`;
  els.prepareStatus.textContent =
    pct >= 100 ? 'Downloaded. Loading the model…' : `Downloading Gemini Nano… ${pct}%`;
}

els.prepare.addEventListener('click', () => {
  if (preparing) return;
  preparing = true;
  els.prepare.disabled = true;
  els.prepareStatus.textContent = 'Preparing Gemini Nano…';
  // Called synchronously from the click so Chrome sees the user gesture.
  const ready = prepareGradeDevice(fb.ai, showProgress);
  void ready
    .then(() => {
      els.prepareStatus.textContent = 'Gemini Nano is ready.';
    })
    .catch((err: unknown) => {
      console.error('[LectureLoop] prepare failed', err);
      els.prepareStatus.textContent = `Could not prepare Nano: ${err instanceof Error ? err.message : String(err)}`;
    })
    .finally(async () => {
      preparing = false;
      showProgress(null);
      await refreshAvailability();
    });
});

// ---- Boot --------------------------------------------------------------------

function setOnline(): void {
  env = { ...env, online: navigator.onLine };
  renderEnv();
}
window.addEventListener('online', setOnline);
window.addEventListener('offline', setOnline);

renderEnv();
void refreshAvailability();

if (fb.kind === 'configured' && allowsCloud(fb)) {
  void appCheckResponds(fb.appCheck, APP_CHECK_WAIT_MS).then((ok) => {
    env = { ...env, appCheck: ok ? 'responding' : 'stuck' };
    renderEnv();
  });
}
