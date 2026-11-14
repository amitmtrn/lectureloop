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

const { GradeTimeoutError } = await import('../src/grade');
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
const settle_ = () => new Promise((r) => setTimeout(r, 0));

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

  it('keeps the lock until a timed-out call settles', async () => {
    const lock = createInferenceLock();
    const release = lock.tryAcquire();
    let settle!: () => void;
    const settled = new Promise<void>((r) => (settle = r));
    if (release) lock.holdUntil(release, settled);
    expect(lock.busy()).toBe(true);
    expect(lock.waitingForLate()).toBe(true);
    expect(lock.tryAcquire()).toBeNull();
    settle();
    await Promise.resolve();
    await Promise.resolve();
    expect(lock.busy()).toBe(false);
    expect(lock.waitingForLate()).toBe(false);
  });

  it('batch: a timed-out call keeps Run and Grade disabled, with a note, until it settles', async () => {
    let settle!: () => void;
    const settled = new Promise<void>((r) => (settle = r));
    gradeAnswer.mockRejectedValue(new GradeTimeoutError(180_000, settled));
    const ctx = makeCtx();
    initSingleGrade(ctx);
    initBatch(ctx);

    btn('run-batch').click();
    await vi.waitFor(() =>
      expect(document.getElementById('batch-status')?.textContent).toContain(
        'Still waiting for the previous model call',
      ),
    );
    expect(btn('run-batch').disabled).toBe(true);
    expect(btn('grade').disabled).toBe(true);
    btn('run-batch').click();
    await settle_();
    expect(gradeAnswer).toHaveBeenCalledTimes(1);

    settle();
    await vi.waitFor(() => expect(btn('run-batch').disabled).toBe(false));
    expect(btn('grade').disabled).toBe(false);
    expect(document.getElementById('batch-status')?.textContent).toContain('You can run again');
  });

  it('single: a timed-out grade keeps the lock until the call settles', async () => {
    let settle!: () => void;
    const settled = new Promise<void>((r) => (settle = r));
    gradeAnswer.mockRejectedValue(new GradeTimeoutError(60_000, settled));
    const ctx = makeCtx();
    initSingleGrade(ctx);
    initBatch(ctx);

    btn('grade').click();
    await vi.waitFor(() =>
      expect(document.getElementById('grade-status')?.textContent).toContain(
        'Still waiting for the previous model call',
      ),
    );
    expect(btn('grade').disabled).toBe(true);
    expect(btn('run-batch').disabled).toBe(true);
    settle();
    await vi.waitFor(() => expect(btn('grade').disabled).toBe(false));
    expect(btn('run-batch').disabled).toBe(false);
  });

  it('disables Grade and starts no second call while the batch runs', async () => {
    let finish: (v: unknown) => void = () => {};
    gradeAnswer.mockImplementation(() => new Promise((r) => (finish = r)));
    const ctx = makeCtx();
    initSingleGrade(ctx);
    initBatch(ctx);

    btn('run-batch').click();
    await settle_();
    expect(btn('grade').disabled).toBe(true);
    btn('grade').click();
    await settle_();
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
    await settle_();
    expect(btn('run-batch').disabled).toBe(true);
    btn('run-batch').click();
    await settle_();
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
