import { AIError, AIErrorCode, InferenceMode } from 'firebase/ai';
import { describe, expect, it } from 'vitest';
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
