// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { InferenceMode, type AI } from 'firebase/ai';
import type * as GradeModule from '../src/grade';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInferenceLock, type GateCtx } from '../src/gate-ctx';
import type { UserChoice } from '../src/routing';

const gradeAnswer = vi.hoisted(() => vi.fn());
vi.mock('../src/grade', async (importOriginal) => ({
  ...(await importOriginal<typeof GradeModule>()),
  gradeAnswer,
}));

const { initSingleGrade } = await import('../src/gate-single');
const { initBatch } = await import('../src/gate-batch');

function makeCtx(): GateCtx {
  return {
    fb: { kind: 'local', ai: {} as AI, missing: [] },
    env: () => ({
      browser: { name: 'Chrome', major: 141, isMobile: false },
      languageModelExists: true,
      availability: 'available',
      adapterAttached: true,
      online: true,
      configured: false,
      missingConfig: [],
      appCheck: 'not-configured',
      probed: true,
    }),
    routeInput: (userChoice: UserChoice) => ({
      userChoice,
      deviceAvailability: 'available',
      adapterAttached: true,
      online: true,
      cloudConfigured: false,
      appCheckResponsive: false,
    }),
    onEnv: (fn) => fn(),
    inference: createInferenceLock(),
  };
}

const ok = {
  verdict: { verdict: 'correct', missedPoints: [], confidence: 0.9, reason: 'r' },
  source: 'on_device',
  latencyMs: 500,
  attempts: 1,
};
const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  const html = readFileSync('gate.html', 'utf8');
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  gradeAnswer.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('inference lock (one on-device call at a time)', () => {
  it('lets only the first holder in and releases once', () => {
    const lock = createInferenceLock();
    const release = lock.tryAcquire();
    expect(release).not.toBeNull();
    expect(lock.tryAcquire()).toBeNull();
    release?.();
    release?.();
    expect(lock.busy()).toBe(false);
    expect(lock.tryAcquire()).not.toBeNull();
  });

  it('disables Grade and starts no second call while the batch runs', async () => {
    let finish: (v: unknown) => void = () => {};
    gradeAnswer.mockImplementation(() => new Promise((r) => (finish = r)));
    const ctx = makeCtx();
    initSingleGrade(ctx);
    initBatch(ctx);

    btn('run-batch').click();
    await settle();
    expect(btn('grade').disabled).toBe(true);
    btn('grade').click();
    await settle();
    expect(gradeAnswer).toHaveBeenCalledTimes(1); // the warm-up only

    gradeAnswer.mockResolvedValue(ok);
    finish(ok);
    await vi.waitFor(() => expect(btn('run-batch').disabled).toBe(false));
    expect(btn('grade').disabled).toBe(false);
  });

  it('disables Run while a grade is in flight and re-enables it afterwards', async () => {
    let finish: (v: unknown) => void = () => {};
    gradeAnswer.mockImplementation(() => new Promise((r) => (finish = r)));
    const ctx = makeCtx();
    initSingleGrade(ctx);
    initBatch(ctx);

    btn('grade').click();
    await settle();
    expect(btn('run-batch').disabled).toBe(true);
    btn('run-batch').click();
    await settle();
    expect(gradeAnswer).toHaveBeenCalledTimes(1);
    expect(gradeAnswer.mock.calls[0]?.[1]).toBe(InferenceMode.ONLY_ON_DEVICE);

    finish(ok);
    await vi.waitFor(() => expect(btn('run-batch').disabled).toBe(false));
    expect(btn('grade').disabled).toBe(false);
  });

  it('releases the lock when a grade fails', async () => {
    gradeAnswer.mockRejectedValue(new Error('boom'));
    const ctx = makeCtx();
    initSingleGrade(ctx);
    initBatch(ctx);
    btn('grade').click();
    await vi.waitFor(() => expect(btn('run-batch').disabled).toBe(false));
    expect(ctx.inference.busy()).toBe(false);
  });
});
