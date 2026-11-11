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

function splitWords(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > maxChars) {
      // A single enormous "word" (e.g. a URL or base64 blob): hard-split it.
      if (current) pieces.push(current);
      current = '';
      for (let i = 0; i < word.length; i += maxChars) pieces.push(word.slice(i, i + maxChars));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      pieces.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Breaks a unit that is too big into sentence-sized (or word-sized) pieces. */
function splitOversized(paragraph: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const sentence of splitSentences(paragraph)) {
    if (sentence.length <= maxChars) out.push(sentence);
    else out.push(...splitWords(sentence, maxChars));
  }
  return out;
}

/** Greedily packs units into chunks of at most maxChars, joined by `sep`. */
function pack(units: string[], maxChars: number, sep: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    const candidate = current ? `${current}${sep}${unit}` : unit;
    if (current && candidate.length > maxChars) {
      chunks.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Splits text into chunks under `maxTokens` (estimated), preferring paragraph
 * boundaries, then sentence boundaries, then word boundaries.
 */
export function chunkText(text: string, maxTokens = DEFAULT_CHUNK_TOKENS): string[] {
  if (maxTokens < 1) throw new RangeError('maxTokens must be >= 1');
  // Character budget from the text's overall chars-per-token ratio: 4 for
  // plain English, down to 1 for text that's entirely non-ASCII.
  const weight = tokenWeight(text);
  const charsPerToken = weight > 0 ? Math.min(CHARS_PER_TOKEN, text.length / weight) : 1;
  const maxChars = Math.max(1, Math.floor(maxTokens * charsPerToken));

  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;
  const flush = (): void => {
    if (current.length) chunks.push(current.join('\n\n'));
    current = [];
    currentLen = 0;
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      chunks.push(...pack(splitOversized(paragraph, maxChars), maxChars, ' '));
      continue;
    }
    const added = currentLen === 0 ? paragraph.length : currentLen + 2 + paragraph.length;
    if (added > maxChars) flush();
    current.push(paragraph);
    currentLen = currentLen === 0 ? paragraph.length : currentLen + 2 + paragraph.length;
  }
  flush();
  return chunks;
}
