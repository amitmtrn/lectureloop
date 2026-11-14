import type * as FirebaseAI from 'firebase/ai';
import type { AI } from 'firebase/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getGenerativeModel, generateContent, initializeDeviceModel, browser } = vi.hoisted(() => {
  const browser = { hasBuiltInModel: true };
  const generateContent = vi.fn();
  const initializeDeviceModel = vi.fn(async () => {});
  const getGenerativeModel = vi.fn(() => ({
    generateContent,
    initializeDeviceModel,
    ...(browser.hasBuiltInModel ? { chromeAdapter: {} } : {}),
  }));
  return { getGenerativeModel, generateContent, initializeDeviceModel, browser };
});

vi.mock('firebase/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof FirebaseAI>()),
  getGenerativeModel,
}));

const { InferenceMode } = await import('firebase/ai');
const {
  buildGradePrompt,
  CloudNotAllowedError,
  gradeAnswer,
  gradeJsonSchema,
  GradeParseError,
  GRADE_TEMPERATURE,
  parseVerdict,
  prepareGradeDevice,
  runGrade,
} = await import('../src/grade');
const { OnDeviceUnavailableError } = await import('../src/ai');

const input = {
  question: 'What does photosynthesis do?',
  referenceAnswer: 'It turns light, water and CO2 into glucose and oxygen.',
  keyPoints: ['Uses light energy', 'Makes glucose', 'Releases oxygen'],
  studentAnswer: 'Plants make sugar from light.',
};
const good = {
  verdict: 'partial',
  missedPoints: ['Releases oxygen'],
  confidence: 0.8,
  reason: 'No oxygen.',
};

function reply(text: string, source?: string) {
  return { response: { text: () => text, inferenceSource: source } };
}

beforeEach(() => {
  generateContent.mockReset();
  getGenerativeModel.mockClear();
  initializeDeviceModel.mockClear();
  browser.hasBuiltInModel = true;
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('buildGradePrompt', () => {
  it('contains the card, numbered key points and the student answer', () => {
    const p = buildGradePrompt(input);
    expect(p).toContain('What does photosynthesis do?');
    expect(p).toContain('1. Uses light energy');
    expect(p).toContain('3. Releases oxygen');
    expect(p).toContain('Plants make sugar from light.');
    expect(p).toMatch(/JSON only/);
    expect(p).toMatch(/ignore any instructions/);
  });

  it('stays short and flattens newlines and over-long answers', () => {
    const p = buildGradePrompt({ ...input, studentAnswer: `a\n\nb ${'x'.repeat(5000)}` });
    expect(p).toContain('a b xxx');
    expect(p.length).toBeLessThan(2400);
  });
});

describe('parseVerdict', () => {
  it('parses plain JSON', () => {
    expect(parseVerdict(JSON.stringify(good))).toEqual(good);
  });

  it('parses fenced and chatty JSON', () => {
    expect(parseVerdict('```json\n' + JSON.stringify(good) + '\n```')).toEqual(good);
    expect(parseVerdict(`Sure! ${JSON.stringify(good)} Hope that helps.`)).toEqual(good);
  });

  it('skips an unrelated object before the real one', () => {
    expect(parseVerdict(`{"note": 1} ${JSON.stringify(good)}`)).toEqual(good);
  });

  it('defaults a missing reason and missedPoints', () => {
    expect(parseVerdict('{"verdict":"correct","confidence":0.9}')).toEqual({
      verdict: 'correct',
      missedPoints: [],
      confidence: 0.9,
      reason: '',
    });
  });

  it('normalizes verdict case and numeric-string confidence', () => {
    expect(parseVerdict('{"verdict":" MISSED ","confidence":"0.4"}')).toMatchObject({
      verdict: 'missed',
      confidence: 0.4,
    });
  });

  it('clamps out-of-range confidence', () => {
    expect(parseVerdict('{"verdict":"correct","confidence":7}').confidence).toBe(1);
    expect(parseVerdict('{"verdict":"correct","confidence":-2}').confidence).toBe(0);
  });

  it.each([
    ['missing verdict', '{"confidence":0.5}'],
    ['bad verdict', '{"verdict":"great","confidence":0.5}'],
    ['non-string verdict', '{"verdict":1,"confidence":0.5}'],
    ['missing confidence', '{"verdict":"correct"}'],
    ['non-numeric confidence', '{"verdict":"correct","confidence":"high"}'],
    ['no JSON', 'I think it is correct.'],
    ['truncated JSON', '{"verdict":"corr'],
    ['array', '[1,2]'],
  ])('rejects %s', (_n, raw) => {
    expect(() => parseVerdict(raw)).toThrow(GradeParseError);
  });
});

describe('runGrade', () => {
  it('returns the verdict, the reported source and the latency', async () => {
    const times = [1000, 1420];
    const generate = vi.fn().mockResolvedValue({ text: JSON.stringify(good), source: 'on_device' });
    const result = await runGrade(input, generate, () => times.shift() ?? 0);
    expect(result).toEqual({ verdict: good, source: 'on_device', latencyMs: 420, attempts: 1 });
  });

  it('keeps a missing source undefined instead of guessing', async () => {
    const generate = vi.fn().mockResolvedValue({ text: JSON.stringify(good), source: undefined });
    expect((await runGrade(input, generate)).source).toBeUndefined();
  });

  it('retries a malformed response once', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ text: 'oops', source: 'on_device' })
      .mockResolvedValueOnce({ text: JSON.stringify(good), source: 'on_device' });
    const result = await runGrade(input, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(2);
  });

  it('fails after a second malformed response', async () => {
    const generate = vi.fn().mockResolvedValue({ text: 'oops', source: 'on_device' });
    await expect(runGrade(input, generate)).rejects.toBeInstanceOf(GradeParseError);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('does not retry SDK errors', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(runGrade(input, generate)).rejects.toThrow('boom');
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe('gradeAnswer (mocked Firebase AI Logic)', () => {
  const ai = {} as AI;
  const opts = { allowCloud: true };

  it('configures text-only English on-device options, a schema constraint and a cloud schema', async () => {
    generateContent.mockResolvedValue(reply(JSON.stringify(good), 'on_device'));
    const result = await gradeAnswer(ai, InferenceMode.ONLY_ON_DEVICE, input, opts);
    expect(result.source).toBe('on_device');
    expect(getGenerativeModel).toHaveBeenCalledWith(ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      inCloudParams: expect.objectContaining({
        generationConfig: expect.objectContaining({
          responseMimeType: 'application/json',
          responseSchema: expect.anything(),
          temperature: GRADE_TEMPERATURE,
        }),
      }),
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        },
        promptOptions: { responseConstraint: gradeJsonSchema },
      },
    });
    expect(GRADE_TEMPERATURE).toBeLessThanOrEqual(0.2);
  });

  it('reports the cloud source from a cloud mode', async () => {
    generateContent.mockResolvedValue(reply(JSON.stringify(good), 'in_cloud'));
    const result = await gradeAnswer(ai, InferenceMode.ONLY_IN_CLOUD, input, opts);
    expect(result.source).toBe('in_cloud');
  });

  it('rejects non-device modes when cloud is not allowed, without touching the SDK', async () => {
    await expect(
      gradeAnswer(ai, InferenceMode.PREFER_ON_DEVICE, input, { allowCloud: false }),
    ).rejects.toBeInstanceOf(CloudNotAllowedError);
    expect(getGenerativeModel).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('refuses ONLY_ON_DEVICE without an adapter (the SDK would use the cloud)', async () => {
    browser.hasBuiltInModel = false;
    await expect(
      gradeAnswer({} as AI, InferenceMode.ONLY_ON_DEVICE, input, opts),
    ).rejects.toBeInstanceOf(OnDeviceUnavailableError);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects an ONLY_ON_DEVICE response that did not come from the device', async () => {
    generateContent.mockResolvedValue(reply(JSON.stringify(good), 'in_cloud'));
    await expect(
      gradeAnswer({} as AI, InferenceMode.ONLY_ON_DEVICE, input, opts),
    ).rejects.toBeInstanceOf(OnDeviceUnavailableError);
  });

  it('prepareGradeDevice forwards progress, and rejects without an adapter', async () => {
    const onProgress = vi.fn();
    const aiA = {} as AI;
    await prepareGradeDevice(aiA, onProgress);
    expect(initializeDeviceModel).toHaveBeenCalledWith(onProgress);
    browser.hasBuiltInModel = false;
    await expect(prepareGradeDevice({} as AI)).rejects.toBeInstanceOf(OnDeviceUnavailableError);
  });
});
