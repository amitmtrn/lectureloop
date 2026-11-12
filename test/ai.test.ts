import type * as FirebaseAI from 'firebase/ai';
import type { AI } from 'firebase/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getGenerativeModel, generateContent, initializeDeviceModel, browser } = vi.hoisted(() => {
  // `hasBuiltInModel: false` mimics a browser without Gemini Nano: the SDK then
  // attaches no on-device adapter and silently sends every mode to the cloud.
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

// Keep the real enums and Schema builder; only stub the network-facing model.
vi.mock('firebase/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof FirebaseAI>()),
  getGenerativeModel,
}));

const {
  buildPrompt,
  CLOUD_MODEL,
  generateStudyPack,
  InferenceMode,
  InferenceSource,
  OnDeviceUnavailableError,
  prepareOnDevice,
  runStudyPack,
  studyPackJsonSchema,
  summarizeSources,
} = await import('../src/ai');

const fakeAI = {} as AI;

function response(pack: object, source?: string) {
  return {
    response: { text: () => JSON.stringify(pack), inferenceSource: source },
  };
}

const paragraphs = [
  'Chloroplasts hold thylakoids. '.repeat(10).trim(),
  'The Calvin cycle fixes carbon. '.repeat(10).trim(),
  'Light intensity can be limiting. '.repeat(10).trim(),
];
const threeChunkText = paragraphs.join('\n\n');
// Budget that fits exactly one paragraph per chunk.
const maxChunkTokens = Math.ceil(Math.max(...paragraphs.map((p) => p.length)) / 4);

beforeEach(() => {
  generateContent.mockReset();
  initializeDeviceModel.mockClear();
  getGenerativeModel.mockClear();
  browser.hasBuiltInModel = true;
});

describe('generateStudyPack (mocked Firebase AI Logic)', () => {
  it('configures hybrid inference with structured output for cloud and device', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    generateContent.mockResolvedValue(
      response({ summary: 'S', keyTerms: [], cards: [] }, InferenceSource.ON_DEVICE),
    );
    await generateStudyPack('Short text.', InferenceMode.ONLY_ON_DEVICE, { ai: fakeAI });

    expect(getGenerativeModel).toHaveBeenCalledTimes(1);
    expect(getGenerativeModel).toHaveBeenCalledWith(fakeAI, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      inCloudParams: expect.objectContaining({
        model: CLOUD_MODEL,
        generationConfig: expect.objectContaining({
          responseMimeType: 'application/json',
          responseSchema: expect.anything(),
        }),
      }),
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        },
        promptOptions: { responseConstraint: studyPackJsonSchema },
      },
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0]?.[0]).toContain('Short text.');
  });

  it('reuses one model per AI instance and mode', async () => {
    generateContent.mockResolvedValue(response({ summary: 'S', keyTerms: [], cards: [] }));
    const ai = {} as AI;
    await generateStudyPack('a', InferenceMode.PREFER_IN_CLOUD, { ai });
    await generateStudyPack('b', InferenceMode.PREFER_IN_CLOUD, { ai });
    await generateStudyPack('c', InferenceMode.ONLY_IN_CLOUD, { ai });
    expect(getGenerativeModel).toHaveBeenCalledTimes(2);
  });

  it('runs each chunk, collects inferenceSource per chunk and merges', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    generateContent
      .mockResolvedValueOnce(
        response(
          {
            summary: 'Chloroplasts.',
            keyTerms: ['Thylakoid', 'Chloroplast'],
            cards: [{ front: 'What holds thylakoids?', back: 'Chloroplasts.' }],
          },
          InferenceSource.ON_DEVICE,
        ),
      )
      .mockResolvedValueOnce(
        response(
          {
            summary: 'Calvin cycle.',
            keyTerms: ['thylakoid', 'Calvin cycle'],
            cards: [
              { front: 'What holds thylakoids', back: 'Duplicate.' },
              { front: 'What fixes carbon?', back: 'The Calvin cycle.' },
            ],
          },
          InferenceSource.IN_CLOUD,
        ),
      )
      .mockResolvedValueOnce(
        response(
          {
            summary: 'Limiting factors.',
            keyTerms: ['Limiting factor'],
            cards: [{ front: 'Name a limiting factor.', back: 'Light intensity.' }],
          },
          InferenceSource.ON_DEVICE,
        ),
      );

    const progress: string[] = [];
    const result = await generateStudyPack(threeChunkText, InferenceMode.PREFER_ON_DEVICE, {
      ai: fakeAI,
      maxChunkTokens,
      onProgress: ({ chunk, total }) => progress.push(`${chunk}/${total}`),
    });

    expect(progress).toEqual(['1/3', '2/3', '3/3']);
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(generateContent.mock.calls[1]?.[0]).toContain('part 2 of 3');
    expect(generateContent.mock.calls[1]?.[0]).toContain('The Calvin cycle fixes carbon.');

    expect(result.sources).toEqual([
      InferenceSource.ON_DEVICE,
      InferenceSource.IN_CLOUD,
      InferenceSource.ON_DEVICE,
    ]);
    expect(summarizeSources(result.sources)).toBe('mixed');
    expect(result.data).toEqual({
      summary: 'Chloroplasts.\n\nCalvin cycle.\n\nLimiting factors.',
      keyTerms: ['Thylakoid', 'Chloroplast', 'Calvin cycle', 'Limiting factor'],
      cards: [
        { front: 'What holds thylakoids?', back: 'Chloroplasts.' },
        { front: 'What fixes carbon?', back: 'The Calvin cycle.' },
        { front: 'Name a limiting factor.', back: 'Light intensity.' },
      ],
    });
    expect(info).toHaveBeenCalledWith('[LectureLoop] inferenceSource: on_device');
    expect(info).toHaveBeenCalledWith('[LectureLoop] inferenceSource: in_cloud');
  });

  it('treats a missing inferenceSource as in-cloud', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    generateContent.mockResolvedValue(response({ summary: 'S', keyTerms: [], cards: [] }));
    const result = await generateStudyPack('Text.', InferenceMode.ONLY_IN_CLOUD, { ai: fakeAI });
    expect(result.sources).toEqual([InferenceSource.IN_CLOUD]);
  });

  it('propagates model errors', async () => {
    generateContent.mockRejectedValue(new Error('boom'));
    await expect(
      generateStudyPack('Text.', InferenceMode.PREFER_ON_DEVICE, { ai: fakeAI }),
    ).rejects.toThrow('boom');
  });
});

describe('"Only on-device" never reaches the cloud', () => {
  it('refuses to call the model when the SDK has no on-device adapter', async () => {
    browser.hasBuiltInModel = false;
    generateContent.mockResolvedValue(
      response({ summary: 'S', keyTerms: [], cards: [] }, InferenceSource.IN_CLOUD),
    );
    const ai = {} as AI;
    await expect(
      generateStudyPack('Private notes.', InferenceMode.ONLY_ON_DEVICE, { ai }),
    ).rejects.toBeInstanceOf(OnDeviceUnavailableError);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('prepareOnDevice rejects instead of silently resolving', async () => {
    browser.hasBuiltInModel = false;
    const ai = {} as AI;
    await expect(prepareOnDevice(ai, InferenceMode.ONLY_ON_DEVICE)).rejects.toBeInstanceOf(
      OnDeviceUnavailableError,
    );
    expect(initializeDeviceModel).not.toHaveBeenCalled();
  });

  it('prepareOnDevice forwards the progress callback when the adapter exists', async () => {
    const onProgress = vi.fn();
    await prepareOnDevice({} as AI, InferenceMode.ONLY_ON_DEVICE, onProgress);
    expect(initializeDeviceModel).toHaveBeenCalledWith(onProgress);
  });

  it('rejects a response that did not come from the device', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    generateContent.mockResolvedValue(
      response({ summary: 'S', keyTerms: [], cards: [] }, InferenceSource.IN_CLOUD),
    );
    await expect(
      generateStudyPack('Text.', InferenceMode.ONLY_ON_DEVICE, { ai: {} as AI }),
    ).rejects.toBeInstanceOf(OnDeviceUnavailableError);
    expect(generateContent).toHaveBeenCalledTimes(1); // not retried
  });

  it('still uses the cloud in hybrid modes without an adapter', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    browser.hasBuiltInModel = false;
    generateContent.mockResolvedValue(response({ summary: 'S', keyTerms: [], cards: [] }));
    const ai = {} as AI;
    await prepareOnDevice(ai, InferenceMode.PREFER_ON_DEVICE);
    const result = await generateStudyPack('Text.', InferenceMode.PREFER_ON_DEVICE, { ai });
    expect(result.sources).toEqual([InferenceSource.IN_CLOUD]);
  });
});

describe('runStudyPack', () => {
  it('rejects empty input without calling the model', async () => {
    const generate = vi.fn();
    await expect(runStudyPack('   ', generate)).rejects.toThrow(/paste some lecture text/i);
    expect(generate).not.toHaveBeenCalled();
  });

  it('retries a malformed response once', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ text: 'not json', source: InferenceSource.ON_DEVICE })
      .mockResolvedValueOnce({
        text: '```json\n{"summary":"ok","keyTerms":[],"cards":[]}\n```',
        source: InferenceSource.ON_DEVICE,
      });
    const result = await runStudyPack('Text.', generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      data: { summary: 'ok', keyTerms: [], cards: [] },
      sources: [InferenceSource.ON_DEVICE],
    });
  });

  it('gives up after a second malformed response', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const generate = vi.fn().mockResolvedValue({ text: 'nope', source: InferenceSource.IN_CLOUD });
    await expect(runStudyPack('Text.', generate)).rejects.toThrow(/did not contain a JSON object/);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

describe('helpers', () => {
  it('summarizeSources', () => {
    expect(summarizeSources([])).toBe('none');
    expect(summarizeSources([InferenceSource.ON_DEVICE, InferenceSource.ON_DEVICE])).toBe(
      'on_device',
    );
    expect(summarizeSources([InferenceSource.IN_CLOUD])).toBe('in_cloud');
    expect(summarizeSources([InferenceSource.IN_CLOUD, InferenceSource.ON_DEVICE])).toBe('mixed');
  });

  it('buildPrompt asks for JSON only and embeds the chunk', () => {
    const prompt = buildPrompt('Some lecture.', 1, 1);
    expect(prompt).toMatch(/JSON only/);
    expect(prompt).toContain('Some lecture.');
    expect(prompt).not.toMatch(/part \d of/);
  });
});
