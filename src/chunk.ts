/**
 * Gemini Nano on-device has a ~9,216 token context window that has to hold the
 * instructions, the (injected) JSON schema, the input chunk and the output.
 * We keep input chunks to ~4,000 estimated tokens to leave plenty of headroom.
 */
export const DEFAULT_CHUNK_TOKENS = 4000;
const CHARS_PER_TOKEN = 4;

/**
 * Weighted character count: ~4 ASCII chars per token for English, but
 * non-ASCII characters (Hebrew, Cyrillic, CJK, emoji, ...) often cost a token
 * each, so they're counted as a full token to stay under the on-device window.
 */
function charWeight(code: number): number {
  return code > 0x7f ? 1 : 1 / CHARS_PER_TOKEN;
}

function tokenWeight(text: string): number {
  let nonAscii = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 0x7f) nonAscii++;
  return (text.length - nonAscii) / CHARS_PER_TOKEN + nonAscii;
}

/** Rough token estimate (~4 chars per token for English, 1 per non-ASCII char). */
export function estimateTokens(text: string): number {
  return Math.ceil(tokenWeight(text));
}

function splitSentences(paragraph: string): string[] {
  // Split after ., ! or ? (optionally followed by closing quotes/brackets) + whitespace.
  return paragraph
    .split(/(?<=[.!?]["')\]]?)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Greedily packs units into chunks of at most maxTokens, joined by `sep`. */
function pack(units: string[], maxTokens: number, sep: string): string[] {
  const sepWeight = tokenWeight(sep);
  const chunks: string[] = [];
  let current: string[] = [];
  let weight = 0;
  for (const unit of units) {
    const unitWeight = tokenWeight(unit);
    if (current.length > 0 && weight + sepWeight + unitWeight > maxTokens) {
      chunks.push(current.join(sep));
      current = [];
      weight = 0;
    }
    weight += (current.length > 0 ? sepWeight : 0) + unitWeight;
    current.push(unit);
  }
  if (current.length > 0) chunks.push(current.join(sep));
  return chunks;
}

/** Cuts a single enormous "word" (e.g. a URL or base64 blob) into budget-sized pieces. */
function hardSplit(word: string, maxTokens: number): string[] {
  const pieces: string[] = [];
  let start = 0;
  let weight = 0;
  for (let i = 0; i < word.length; i++) {
    const code = word.charCodeAt(i);
    const isLowSurrogate = code >= 0xdc00 && code <= 0xdfff; // never cut a surrogate pair
    if (i > start && !isLowSurrogate && weight + charWeight(code) > maxTokens) {
      pieces.push(word.slice(start, i));
      start = i;
      weight = 0;
    }
    weight += charWeight(code);
  }
  if (start < word.length) pieces.push(word.slice(start));
  return pieces;
}

function splitWords(text: string, maxTokens: number): string[] {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => (tokenWeight(word) > maxTokens ? hardSplit(word, maxTokens) : [word]));
  return pack(words, maxTokens, ' ');
}

/** Breaks a unit that is too big into sentence-sized (or word-sized) pieces. */
function splitOversized(paragraph: string, maxTokens: number): string[] {
  return splitSentences(paragraph).flatMap((sentence) =>
    tokenWeight(sentence) <= maxTokens ? [sentence] : splitWords(sentence, maxTokens),
  );
}

/**
 * Splits text into chunks of at most `maxTokens` (estimated), preferring
 * paragraph boundaries, then sentence boundaries, then word boundaries. The
 * budget is measured per chunk, so a non-English passage inside mostly English
 * text still gets appropriately smaller chunks.
 */
export function chunkText(text: string, maxTokens = DEFAULT_CHUNK_TOKENS): string[] {
  if (!(maxTokens >= 1)) throw new RangeError('maxTokens must be >= 1');

  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let fitting: string[] = [];
  const flush = (): void => {
    chunks.push(...pack(fitting, maxTokens, '\n\n'));
    fitting = [];
  };

  for (const paragraph of paragraphs) {
    if (tokenWeight(paragraph) <= maxTokens) {
      fitting.push(paragraph);
    } else {
      flush();
      chunks.push(...pack(splitOversized(paragraph, maxTokens), maxTokens, ' '));
    }
  }
  flush();
  return chunks;
}
