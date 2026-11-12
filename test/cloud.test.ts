import { InferenceMode } from 'firebase/ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modeWithoutCloud, settlesWithin } from '../src/cloud';

describe('settlesWithin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is true for a promise that fulfils in time', async () => {
    await expect(settlesWithin(Promise.resolve('token'), 1000)).resolves.toBe(true);
  });

  it('is true for a promise that rejects in time (a failure is still an answer)', async () => {
    await expect(settlesWithin(Promise.reject(new Error('exchange failed')), 1000)).resolves.toBe(
      true,
    );
  });

  it('is false for a promise that never settles', async () => {
    const result = settlesWithin(new Promise(() => {}), 1000);
    await vi.advanceTimersByTimeAsync(999);
    let settled = false;
    void result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(false);
  });

  it('clears its timer once the promise settles', async () => {
    await settlesWithin(Promise.resolve(), 60_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('modeWithoutCloud', () => {
  it('degrades hybrid modes to on-device only', () => {
    expect(modeWithoutCloud(InferenceMode.PREFER_ON_DEVICE)).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(modeWithoutCloud(InferenceMode.PREFER_IN_CLOUD)).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(modeWithoutCloud(InferenceMode.ONLY_ON_DEVICE)).toBe(InferenceMode.ONLY_ON_DEVICE);
  });

  it('has no fallback for "Only cloud"', () => {
    expect(modeWithoutCloud(InferenceMode.ONLY_IN_CLOUD)).toBeNull();
  });
});
