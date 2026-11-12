import { AIError, AIErrorCode, InferenceMode } from 'firebase/ai';
import { describe, expect, it } from 'vitest';
import { OnDeviceUnavailableError } from '../src/ai';
import { AppCheckStuckError } from '../src/cloud';
import { toFriendlyError } from '../src/errors';
import { StudyPackParseError } from '../src/parse';

describe('toFriendlyError', () => {
  it('explains Chrome setup when ONLY_ON_DEVICE has no model', () => {
    const err = new AIError(
      AIErrorCode.UNSUPPORTED,
      'Inference mode is ONLY_ON_DEVICE, but an on-device model is not available.',
    );
    const f = toFriendlyError(err, InferenceMode.ONLY_ON_DEVICE);
    expect(f.showChromeSetup).toBe(true);
    expect(f.title).toMatch(/Gemini Nano/);
  });

  it('explains Chrome setup when the LanguageModel API is missing', () => {
    const err = new AIError(
      AIErrorCode.API_NOT_ENABLED,
      'Local LanguageModel API not available in this environment.',
    );
    expect(toFriendlyError(err, InferenceMode.ONLY_ON_DEVICE).showChromeSetup).toBe(true);
  });

  it('explains Chrome setup when the app blocks an "Only on-device" cloud fallthrough', () => {
    const f = toFriendlyError(new OnDeviceUnavailableError(), InferenceMode.ONLY_ON_DEVICE);
    expect(f.title).toMatch(/Gemini Nano/);
    expect(f.detail).toMatch(/Only on-device/);
    expect(f.showChromeSetup).toBe(true);
  });

  it('explains a blocked reCAPTCHA when App Check never answers', () => {
    const f = toFriendlyError(new AppCheckStuckError(), InferenceMode.ONLY_IN_CLOUD);
    expect(f.title).toMatch(/Could not reach the cloud/);
    expect(f.detail).toMatch(/reCAPTCHA did not load/);
    expect(f.showChromeSetup).toBeFalsy();
  });

  it('mentions both problems when the cloud is blocked and Nano is missing', () => {
    const f = toFriendlyError(new OnDeviceUnavailableError(), InferenceMode.ONLY_ON_DEVICE, true);
    expect(f.title).toMatch(/Neither/);
    expect(f.detail).toMatch(/reCAPTCHA did not load/);
    expect(f.showChromeSetup).toBe(true);
  });

  it('reports an unreachable cloud', () => {
    const err = new AIError(AIErrorCode.FETCH_ERROR, 'Failed to fetch');
    const f = toFriendlyError(err, InferenceMode.ONLY_IN_CLOUD);
    expect(f.title).toMatch(/Could not reach/);
    expect(f.showChromeSetup).toBeFalsy();
  });

  it('points at Firebase console when the cloud API is not enabled', () => {
    const err = new AIError(AIErrorCode.API_NOT_ENABLED, 'Firebase AI Logic API has not been used');
    const f = toFriendlyError(err, InferenceMode.ONLY_IN_CLOUD);
    expect(f.title).toMatch(/not enabled/);
    expect(f.showChromeSetup).toBeFalsy();
  });

  it('handles App Check, parse and unknown errors', () => {
    expect(
      toFriendlyError(new Error('App Check token is invalid'), InferenceMode.ONLY_IN_CLOUD).title,
    ).toMatch(/App Check/);
    expect(
      toFriendlyError(new StudyPackParseError('bad'), InferenceMode.PREFER_ON_DEVICE).title,
    ).toMatch(/could not read/);
    expect(toFriendlyError('weird', InferenceMode.PREFER_ON_DEVICE).detail).toBe('weird');
  });
});
