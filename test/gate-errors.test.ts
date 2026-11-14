import { InferenceMode } from 'firebase/ai';
import { describe, expect, it } from 'vitest';
import { gateFriendlyError } from '../src/gate-errors';
import { GradeParseError, GradeTimeoutError } from '../src/grade';

describe('gateFriendlyError', () => {
  it('uses wording that fits both Grade and the batch for parse errors', () => {
    const f = gateFriendlyError(new GradeParseError('bad json'), InferenceMode.ONLY_ON_DEVICE);
    expect(f.detail).toContain('Run it again.');
    expect(f.detail).not.toContain('Press Grade');
  });

  it('points a cloud timeout at the connection, not at on-device-internals (R5.12)', () => {
    const err = new GradeTimeoutError(60_000);
    const cloud = gateFriendlyError(err, InferenceMode.ONLY_IN_CLOUD);
    expect(cloud.detail).toContain('internet connection');
    expect(cloud.detail).not.toContain('on-device-internals');
    const device = gateFriendlyError(err, InferenceMode.ONLY_ON_DEVICE);
    expect(device.detail).toContain('chrome://on-device-internals');
    expect(device.detail).not.toContain('internet');
    const both = gateFriendlyError(err, InferenceMode.PREFER_ON_DEVICE).detail;
    expect(both).toContain('on-device-internals');
    expect(both).toContain('internet connection');
  });
});
