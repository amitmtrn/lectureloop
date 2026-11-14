import { InferenceMode } from 'firebase/ai';
import { describe, expect, it } from 'vitest';
import { classifyPath, planRoute, type RouteInput } from '../src/routing';

const base: RouteInput = {
  userChoice: 'auto',
  deviceAvailability: 'available',
  adapterAttached: true,
  online: true,
  cloudConfigured: true,
  appCheckResponsive: true,
};
const plan = (over: Partial<RouteInput>) => planRoute({ ...base, ...over });

describe('planRoute auto', () => {
  it('prefers the device and keeps the cloud as fallback when both work', () => {
    expect(plan({})).toMatchObject({
      mode: InferenceMode.PREFER_ON_DEVICE,
      expectedPath: 'on_device',
    });
  });

  it('does not promise a cloud retry after an on-device error (R8.9)', () => {
    const reason = plan({}).reason;
    expect(reason).toContain('falls back to the cloud if Nano is not available');
    expect(reason).not.toContain('The cloud is the fallback');
  });

  it.each([
    ['offline', { online: false }, /offline/],
    ['cloud not configured', { cloudConfigured: false }, /not configured/],
    ['App Check not responding', { appCheckResponsive: false }, /App Check/],
  ])('is device-only when %s', (_n, over, reason) => {
    const p = plan(over);
    expect(p.mode).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(p.expectedPath).toBe('on_device');
    expect(p.reason).toMatch(reason);
  });

  it.each(['downloadable', 'downloading', 'unavailable', 'unknown', 'api-missing'] as const)(
    'falls back to the cloud when the device is %s and the cloud works',
    (deviceAvailability) => {
      expect(plan({ deviceAvailability })).toMatchObject({
        mode: InferenceMode.ONLY_IN_CLOUD,
        expectedPath: 'in_cloud',
      });
    },
  );

  it('falls back to the cloud when the adapter is not attached', () => {
    const p = plan({ adapterAttached: false });
    expect(p.mode).toBe(InferenceMode.ONLY_IN_CLOUD);
    expect(p.reason).toMatch(/adapter/);
  });

  it('is blocked, naming both blockers, when nothing is usable', () => {
    const p = plan({ deviceAvailability: 'downloadable', online: false });
    expect(p).toMatchObject({ mode: null, expectedPath: 'none' });
    expect(p.reason).toMatch(/Prepare Nano/);
    expect(p.reason).toMatch(/offline/);
  });
});

describe('planRoute device', () => {
  it('runs on-device when ready, ignoring the cloud state', () => {
    expect(plan({ userChoice: 'device', cloudConfigured: false })).toMatchObject({
      mode: InferenceMode.ONLY_ON_DEVICE,
      expectedPath: 'on_device',
    });
  });

  it('never falls back to the cloud when the device is not ready', () => {
    const p = plan({ userChoice: 'device', deviceAvailability: 'api-missing' });
    expect(p).toMatchObject({ mode: null, expectedPath: 'none' });
    expect(p.reason).toMatch(/LanguageModel/);
  });

  it('is blocked without the adapter', () => {
    expect(plan({ userChoice: 'device', adapterAttached: false }).mode).toBeNull();
  });
});

describe('planRoute cloud', () => {
  it('works when configured, online and App Check responds, even with a ready device', () => {
    expect(plan({ userChoice: 'cloud' })).toMatchObject({
      mode: InferenceMode.ONLY_IN_CLOUD,
      expectedPath: 'in_cloud',
    });
  });

  it('says Firebase failed to initialize when config is present but init threw', () => {
    const p = plan({ userChoice: 'cloud', cloudConfigured: false, cloudInitFailed: true });
    expect(p.mode).toBeNull();
    expect(p.reason).toContain('failed to initialize');
    expect(p.reason).not.toContain('not configured');
  });

  it.each([
    [{ cloudConfigured: false }, /not configured/],
    [{ online: false }, /offline/],
    [{ appCheckResponsive: false }, /App Check/],
  ] as const)('is blocked with %j', (over, reason) => {
    const p = plan({ userChoice: 'cloud', ...over });
    expect(p).toMatchObject({ mode: null, expectedPath: 'none' });
    expect(p.reason).toMatch(reason);
  });
});

describe('classifyPath', () => {
  it('accepts a matching path', () => {
    expect(classifyPath('on_device', 'on_device')).toMatchObject({
      actual: 'on_device',
      mismatch: false,
    });
    expect(classifyPath('in_cloud', 'in_cloud').mismatch).toBe(false);
  });

  it('flags expected device but ran in the cloud', () => {
    const c = classifyPath('on_device', 'in_cloud');
    expect(c).toMatchObject({ actual: 'in_cloud', mismatch: true });
    expect(c.message).toMatch(/Expected on-device but it ran in the cloud/);
  });

  it('flags expected cloud but ran on-device', () => {
    expect(classifyPath('in_cloud', 'on_device').mismatch).toBe(true);
  });

  it('never guesses a missing or unknown source', () => {
    for (const src of [undefined, null, '', 'mystery', 42]) {
      expect(classifyPath('on_device', src)).toMatchObject({ actual: 'unknown', mismatch: true });
    }
  });

  it('flags any run when the plan was blocked', () => {
    expect(classifyPath('none', 'on_device').mismatch).toBe(true);
  });
});

describe('App Check still checking', () => {
  it('says it is still checking, not that reCAPTCHA failed', () => {
    const p = plan({
      userChoice: 'cloud',
      appCheckResponsive: false,
      appCheckChecking: true,
    });
    expect(p.mode).toBeNull();
    expect(p.reason).toMatch(/still being checked/);
    expect(p.reason).not.toMatch(/reCAPTCHA/);
  });

  it('still blames reCAPTCHA once the wait is over', () => {
    const p = plan({ userChoice: 'cloud', appCheckResponsive: false, appCheckChecking: false });
    expect(p.reason).toMatch(/reCAPTCHA/);
  });
});
