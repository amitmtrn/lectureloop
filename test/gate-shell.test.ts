// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import type { AppCheck } from 'firebase/app-check';
import type { AI } from 'firebase/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GateFirebase } from '../src/gate-firebase';
import { initGateShell, type ShellDeps } from '../src/gate-shell';

type Probe = Awaited<ReturnType<ShellDeps['probe']>>;
const READY: Probe = { languageModelExists: true, availability: 'available' };

const local: GateFirebase = { kind: 'local', ai: {} as AI, missing: ['VITE_FIREBASE_API_KEY'] };
const configured: GateFirebase = { kind: 'configured', ai: {} as AI, appCheck: {} as AppCheck };

function makeDeps(over: Partial<ShellDeps> = {}): ShellDeps {
  return {
    fb: local,
    browser: { name: 'Chrome', major: 141, isMobile: false },
    probe: vi.fn(async () => READY),
    adapterAttached: () => true,
    prepare: vi.fn(async () => {}),
    appCheckResponds: vi.fn(async () => true),
    appCheckWaitMs: 10,
    pollMs: 5,
    isOnline: () => true,
    ...over,
  };
}

const text = (id: string) => document.getElementById(id)?.textContent ?? '';
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  const html = readFileSync('gate.html', 'utf8');
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('environment panel', () => {
  it('says it is checking, with no device fixes, until the first probe resolves', async () => {
    let resolve!: (p: Probe) => void;
    const shell = initGateShell(
      makeDeps({ probe: () => new Promise<Probe>((r) => (resolve = r)) }),
    );
    shell.start();
    expect(text('fixes')).toContain('Checking this machine');
    expect(text('fixes')).not.toContain('flags');
    resolve(READY);
    await vi.waitFor(() => expect(text('fixes')).not.toContain('Checking this machine'));
    expect(text('fixes')).not.toContain('flags');
  });

  it('does not say "nothing to fix" when the availability probe failed', async () => {
    const shell = initGateShell(
      makeDeps({ probe: async () => ({ languageModelExists: true, availability: 'unknown' }) }),
    );
    shell.start();
    await vi.waitFor(() => expect(text('fixes')).toContain('Could not read'));
    expect(text('fixes')).not.toContain('Nothing to fix');
  });

  it('shows the Firebase init error, not the "not configured" hint', async () => {
    const shell = initGateShell(
      makeDeps({ fb: { kind: 'local', ai: {} as AI, missing: [], error: 'bad api key' } }),
    );
    shell.start();
    await vi.waitFor(() => expect(text('fixes')).toContain('bad api key'));
    expect(text('fixes')).not.toContain('SETUP-FIREBASE');
    expect(text('rows-cloud')).toContain('init failed');
  });

  it('reports "still being checked" for the cloud plan while App Check waits', async () => {
    const shell = initGateShell(
      makeDeps({ fb: configured, appCheckResponds: () => new Promise(() => {}) }),
    );
    shell.start();
    expect(shell.ctx.routeInput('cloud').appCheckChecking).toBe(true);
  });
});

describe('availability polling', () => {
  it('re-probes while downloading and unblocks by itself', async () => {
    const probe = vi
      .fn<ShellDeps['probe']>()
      .mockResolvedValueOnce({ languageModelExists: true, availability: 'downloading' })
      .mockResolvedValue(READY);
    const shell = initGateShell(makeDeps({ probe }));
    shell.start();
    await vi.waitFor(() => expect(shell.ctx.env().availability).toBe('available'));
    expect(probe.mock.calls.length).toBeGreaterThanOrEqual(2);
    const calls = probe.mock.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(probe).toHaveBeenCalledTimes(calls); // stops polling once available
  });
});

describe('App Check retry', () => {
  it('checks again when the browser comes back online after a stuck result', async () => {
    const responds = vi
      .fn<ShellDeps['appCheckResponds']>()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    let online = true;
    const shell = initGateShell(
      makeDeps({ fb: configured, appCheckResponds: responds, isOnline: () => online }),
    );
    shell.start();
    await vi.waitFor(() => expect(shell.ctx.env().appCheck).toBe('stuck'));
    online = false;
    window.dispatchEvent(new Event('offline'));
    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(shell.ctx.env().appCheck).toBe('responding'));
    expect(responds).toHaveBeenCalledTimes(2);
  });

  it('does not touch App Check on the placeholder app', async () => {
    const deps = makeDeps();
    initGateShell(deps).start();
    await settle();
    expect(deps.appCheckResponds).not.toHaveBeenCalled();
  });
});

describe('Prepare Nano', () => {
  const click = () => (document.getElementById('prepare') as HTMLButtonElement).click();
  const bar = () => document.getElementById('progress') as HTMLElement;

  it('calls prepare synchronously inside the click, and re-probes after', async () => {
    const deps = makeDeps({
      probe: vi
        .fn<ShellDeps['probe']>()
        .mockResolvedValueOnce({ languageModelExists: true, availability: 'downloadable' })
        .mockResolvedValue(READY),
    });
    const shell = initGateShell(deps);
    shell.start();
    await vi.waitFor(() =>
      expect(document.getElementById('prepare')).toHaveProperty('disabled', false),
    );
    click();
    expect(deps.prepare).toHaveBeenCalledTimes(1); // same tick as the click
    await vi.waitFor(() => expect(shell.ctx.env().availability).toBe('available'));
    expect(text('prepare-status')).toBe('Gemini Nano is ready.');
    expect(bar().hidden).toBe(true);
  });

  it('shows download progress as a progressbar and announces once per 10%', async () => {
    let report!: (f: number) => void;
    let finish!: () => void;
    const shell = initGateShell(
      makeDeps({
        prepare: (onProgress) => {
          report = onProgress;
          return new Promise<void>((r) => (finish = r));
        },
      }),
    );
    shell.start();
    await vi.waitFor(() =>
      expect(document.getElementById('prepare')).toHaveProperty('disabled', false),
    );
    click();

    report(0.01);
    expect(bar().hidden).toBe(false);
    expect(text('prepare-status')).toBe('Downloading Gemini Nano… 1%');
    report(0.05);
    report(0.09);
    expect(text('prepare-status')).toBe('Downloading Gemini Nano… 1%'); // throttled
    expect(bar().getAttribute('aria-valuenow')).toBe('9'); // bar still follows
    report(0.1);
    expect(text('prepare-status')).toBe('Downloading Gemini Nano… 10%');
    report(1);
    expect(text('prepare-status')).toContain('Downloaded');

    finish();
    await vi.waitFor(() => expect(bar().hidden).toBe(true));
    void shell;
  });

  it('shows the error and re-probes when preparation fails', async () => {
    const probe = vi.fn<ShellDeps['probe']>(async () => ({
      languageModelExists: true,
      availability: 'downloadable',
    }));
    const shell = initGateShell(
      makeDeps({ probe, prepare: vi.fn(async () => Promise.reject(new Error('disk full'))) }),
    );
    shell.start();
    await vi.waitFor(() =>
      expect(document.getElementById('prepare')).toHaveProperty('disabled', false),
    );
    const before = probe.mock.calls.length;
    click();
    await vi.waitFor(() =>
      expect(text('prepare-status')).toContain('Could not prepare Nano: disk full'),
    );
    await vi.waitFor(() => expect(probe.mock.calls.length).toBeGreaterThan(before));
    expect(text('fixes')).toContain('Prepare Nano'); // the relevant fix is still listed
    expect(document.getElementById('prepare')).toHaveProperty('disabled', false);
  });
});
