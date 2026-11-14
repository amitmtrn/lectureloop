// @vitest-environment jsdom
import type { AI } from 'firebase/ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Vitest resolves firebase/ai to its Node build, which has no on-device adapter. Load the browser
// build instead so the real adapter code path runs against a fake LanguageModel.
vi.mock('firebase/ai', () => import('../node_modules/@firebase/ai/dist/esm/index.esm.js'));

const { InferenceMode, getGenerativeModel } = await import('firebase/ai');
import {
  allowsCloud,
  createLocalAI,
  initGateFirebase,
  LOCAL_PLACEHOLDER_OPTIONS,
} from '../src/gate-firebase';
import { gradeAnswer } from '../src/grade';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('placeholder options', () => {
  it('are plainly fake', () => {
    const text = JSON.stringify(LOCAL_PLACEHOLDER_OPTIONS);
    expect(text).toMatch(/placeholder/);
    expect(text).not.toMatch(/AIza/);
  });
});

describe('initGateFirebase', () => {
  it('uses the real status when configured', () => {
    const ai = {} as AI;
    const appCheck = {} as never;
    const fb = initGateFirebase({ ready: true, ai, appCheck });
    expect(fb).toEqual({ kind: 'configured', ai, appCheck });
    expect(allowsCloud(fb)).toBe(true);
  });

  it('falls back to the local placeholder app without cloud when config is missing', () => {
    const fb = initGateFirebase({ ready: false, missing: ['VITE_FIREBASE_API_KEY'] });
    expect(fb.kind).toBe('local');
    expect(allowsCloud(fb)).toBe(false);
    if (fb.kind === 'local') expect(fb.missing).toEqual(['VITE_FIREBASE_API_KEY']);
  });

  it('keeps the init error when Firebase failed', () => {
    const fb = initGateFirebase({ ready: false, missing: [], error: 'bad' });
    expect(fb).toMatchObject({ kind: 'local', error: 'bad' });
  });
});

describe('ONLY_ON_DEVICE with the placeholder app makes no network request', () => {
  it('grades through a fake LanguageModel and never calls fetch', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network is forbidden in this test')));
    vi.stubGlobal('fetch', fetchSpy);
    const session = {
      prompt: vi.fn(async () =>
        JSON.stringify({ verdict: 'correct', missedPoints: [], confidence: 0.9, reason: 'ok' }),
      ),
      destroy: vi.fn(),
    };
    const languageModel = {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => session),
    };
    vi.stubGlobal('LanguageModel', languageModel);

    const ai = createLocalAI();
    const result = await gradeAnswer(
      ai,
      InferenceMode.ONLY_ON_DEVICE,
      { question: 'q', referenceAnswer: 'a', keyPoints: ['k'], studentAnswer: 's' },
      { allowCloud: false },
    );

    expect(result.source).toBe('on_device');
    expect(session.prompt).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails instead of calling the cloud when the on-device model is unavailable', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network is forbidden in this test')));
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('LanguageModel', {
      availability: vi.fn(async () => 'unavailable'),
      create: vi.fn(),
    });
    const model = getGenerativeModel(createLocalAI(), { mode: InferenceMode.ONLY_ON_DEVICE });
    await expect(model.generateContent('hi')).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
