import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  Schema,
  type AI,
  type GenerativeModel,
} from 'firebase/ai';
import { chunkText, DEFAULT_CHUNK_TOKENS } from './chunk';
import { mergeStudyPacks } from './merge';
import { parseStudyPack, StudyPackParseError } from './parse';
import type { StudyPack } from './types';

export { InferenceMode, InferenceSource };

/** Default cloud model for hybrid inference (matches the SDK's own default). */
export const CLOUD_MODEL = 'gemini-3.5-flash-lite';

export const MODE_OPTIONS: { value: InferenceMode; label: string; help: string }[] = [
  {
    value: InferenceMode.PREFER_ON_DEVICE,
    label: 'Prefer on-device',
    help: 'Uses Gemini Nano in Chrome when it is ready; otherwise falls back to the cloud.',
  },
  {
    value: InferenceMode.ONLY_ON_DEVICE,
    label: 'Only on-device',
    help: 'Never leaves your browser. Fails if Gemini Nano is not available.',
  },
  {
    value: InferenceMode.PREFER_IN_CLOUD,
    label: 'Prefer cloud',
    help: 'Uses the cloud model; falls back to on-device if the cloud is unreachable.',
  },
  {
    value: InferenceMode.ONLY_IN_CLOUD,
    label: 'Only cloud',
    help: 'Always uses the cloud model via Firebase AI Logic.',
  },
];

const MAX_TERMS = 8;
const MAX_CARDS = 8;

/** Cloud structured output (Gemini responseSchema). */
export const studyPackCloudSchema = Schema.object({
  properties: {
    summary: Schema.string({ description: '2-4 sentence summary of the excerpt.' }),
    keyTerms: Schema.array({
      items: Schema.string(),
      maxItems: MAX_TERMS,
    }),
    cards: Schema.array({
      items: Schema.object({
        properties: {
          front: Schema.string({ description: 'A question about the excerpt.' }),
          back: Schema.string({ description: 'A concise answer.' }),
        },
      }),
      maxItems: MAX_CARDS,
    }),
  },
});

/** On-device structured output (Chrome Prompt API responseConstraint, JSON Schema). */
export const studyPackJsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    keyTerms: { type: 'array', items: { type: 'string' }, maxItems: MAX_TERMS },
    cards: {
      type: 'array',
      maxItems: MAX_CARDS,
      items: {
        type: 'object',
        properties: { front: { type: 'string' }, back: { type: 'string' } },
        required: ['front', 'back'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'keyTerms', 'cards'],
  additionalProperties: false,
} as const;

export function buildPrompt(chunk: string, part: number, total: number): string {
  const position =
    total > 1 ? `\nThis excerpt is part ${part} of ${total} of a longer lecture.\n` : '';
  return `You are a study assistant. Read the lecture excerpt and create study material from it.
Respond with JSON only (no Markdown, no extra text) in exactly this shape:
{"summary": string, "keyTerms": string[], "cards": [{"front": string, "back": string}]}
Rules:
- summary: 2-4 sentences in plain English.
- keyTerms: 3-${MAX_TERMS} important terms from the excerpt.
- cards: 3-${MAX_CARDS} flashcards. "front" is a question, "back" is a concise answer (1-2 sentences).
- Only use facts stated in the excerpt.
${position}
Lecture excerpt:
"""
${chunk}
"""`;
}

export function createStudyModel(ai: AI, mode: InferenceMode): GenerativeModel {
  return getGenerativeModel(ai, {
    mode,
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: studyPackCloudSchema,
        temperature: 0.2,
      },
    },
    onDeviceParams: {
      // Text-only English sessions. The SDK default also asks for image input,
      // which makes availability depend on Chrome's multimodal model support.
      createOptions: {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      },
      promptOptions: { responseConstraint: studyPackJsonSchema },
    },
  });
}

/** Thrown when "Only on-device" is selected but the request could not stay local. */
export class OnDeviceUnavailableError extends Error {
  constructor(message = 'The on-device model is not available in this browser.') {
    super(message);
    this.name = 'OnDeviceUnavailableError';
  }
}

/**
 * Whether the SDK attached its on-device (Chrome) adapter to this model.
 *
 * The SDK only creates the adapter when the browser exposes the built-in
 * model. Without it, firebase 13.2.0 routes *every* mode, including
 * ONLY_ON_DEVICE, to the cloud and `initializeDeviceModel()` resolves as a
 * no-op, so "Only on-device" has to be enforced here. The adapter is not part
 * of the public typings; if a future SDK renames it, this fails closed.
 */
export function hasOnDeviceAdapter(model: GenerativeModel): boolean {
  return (model as unknown as { chromeAdapter?: unknown }).chromeAdapter != null;
}

function assertCanStayOnDevice(model: GenerativeModel, mode: InferenceMode): void {
  if (mode === InferenceMode.ONLY_ON_DEVICE && !hasOnDeviceAdapter(model)) {
    throw new OnDeviceUnavailableError();
  }
}

// One model per (AI instance, mode). Reusing the instance matters: the SDK
// tracks the on-device download on the model's internal Chrome adapter.
const modelCache = new WeakMap<AI, Map<InferenceMode, GenerativeModel>>();

export function getStudyModel(ai: AI, mode: InferenceMode): GenerativeModel {
  let byMode = modelCache.get(ai);
  if (!byMode) {
    byMode = new Map();
    modelCache.set(ai, byMode);
  }
  let model = byMode.get(mode);
  if (!model) {
    model = createStudyModel(ai, mode);
    byMode.set(mode, model);
  }
  return model;
}

/**
 * Asks Chrome to download / warm up Gemini Nano. Must be called from a user
 * gesture (e.g. the Generate click). No-op for ONLY_IN_CLOUD.
 * Resolves when the model is ready; throws in ONLY_ON_DEVICE if unavailable.
 */
export async function prepareOnDevice(
  ai: AI,
  mode: InferenceMode,
  onDownloadProgress?: (fraction: number) => void,
): Promise<void> {
  const model = getStudyModel(ai, mode);
  assertCanStayOnDevice(model, mode);
  await model.initializeDeviceModel(onDownloadProgress);
}

export interface GenerateOutput {
  text: string;
  source: InferenceSource;
}

/** One model call. Injectable so orchestration can be tested without Firebase. */
export type GenerateFn = (prompt: string) => Promise<GenerateOutput>;

export function modelGenerateFn(model: GenerativeModel, mode?: InferenceMode): GenerateFn {
  return async (prompt) => {
    // Checked before every call so "Only on-device" text never reaches the cloud.
    if (mode) assertCanStayOnDevice(model, mode);
    const result = await model.generateContent(prompt);
    // Without a hybrid adapter the SDK only talks to the cloud.
    const source = result.response.inferenceSource ?? InferenceSource.IN_CLOUD;
    console.info(`[LectureLoop] inferenceSource: ${source}`);
    if (mode === InferenceMode.ONLY_ON_DEVICE && source !== InferenceSource.ON_DEVICE) {
      throw new OnDeviceUnavailableError(
        'The on-device model is not available: "Only on-device" was selected but the response did not come from the device.',
      );
    }
    return { text: result.response.text(), source };
  };
}

export interface ChunkProgress {
  chunk: number;
  total: number;
}

export interface StudyPackResult {
  data: StudyPack;
  sources: InferenceSource[];
}

export interface RunOptions {
  onProgress?: (progress: ChunkProgress) => void;
  maxChunkTokens?: number;
}

/** Chunk -> generate per chunk (sequentially) -> parse -> merge. */
export async function runStudyPack(
  text: string,
  generate: GenerateFn,
  options: RunOptions = {},
): Promise<StudyPackResult> {
  const chunks = chunkText(text, options.maxChunkTokens ?? DEFAULT_CHUNK_TOKENS);
  if (chunks.length === 0) throw new Error('Please paste some lecture text first.');

  const packs: StudyPack[] = [];
  const sources: InferenceSource[] = [];
  for (const [i, chunk] of chunks.entries()) {
    options.onProgress?.({ chunk: i + 1, total: chunks.length });
    const prompt = buildPrompt(chunk, i + 1, chunks.length);

    // Small models occasionally emit broken JSON; retry a malformed answer once.
    for (let attempt = 1; ; attempt++) {
      const out = await generate(prompt);
      try {
        packs.push(parseStudyPack(out.text));
        sources.push(out.source);
        break;
      } catch (err) {
        if (!(err instanceof StudyPackParseError) || attempt >= 2) throw err;
        console.warn(`[LectureLoop] chunk ${i + 1}: unparseable response, retrying`, err);
      }
    }
  }
  return { data: mergeStudyPacks(packs), sources };
}

export interface GenerateStudyPackOptions extends RunOptions {
  ai: AI;
}

export function generateStudyPack(
  text: string,
  mode: InferenceMode,
  options: GenerateStudyPackOptions,
): Promise<StudyPackResult> {
  const generate = modelGenerateFn(getStudyModel(options.ai, mode), mode);
  return runStudyPack(text, generate, options);
}

export type SourceSummary = 'on_device' | 'in_cloud' | 'mixed' | 'none';

export function summarizeSources(sources: InferenceSource[]): SourceSummary {
  const unique = new Set(sources);
  if (unique.size === 0) return 'none';
  if (unique.size > 1) return 'mixed';
  return unique.has(InferenceSource.ON_DEVICE) ? 'on_device' : 'in_cloud';
}
