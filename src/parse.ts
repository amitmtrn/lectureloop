import type { Card, StudyPack } from './types';

export class StudyPackParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudyPackParseError';
  }
}

/** Removes Markdown code fences such as ```json ... ``` around the payload. */
export function stripCodeFences(text: string): string {
  const fenced = /```[a-zA-Z]*\s*\n?([\s\S]*?)```/.exec(text);
  return (fenced?.[1] ?? text).trim();
}

/**
 * Returns the first balanced `{...}` object in `text`, honouring JSON string
 * literals so braces inside strings don't confuse the scan.
 */
export function extractFirstJsonObject(text: string, fromIndex = 0): string | null {
  const start = text.indexOf('{', fromIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function cleanString(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (Object.hasOwn(obj, key)) return obj[key];
  return undefined;
}

export function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLocaleLowerCase('en');
    if (v === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function coerceCard(value: unknown): Card | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  const front = cleanString(pick(obj, 'front', 'question', 'q', 'term'));
  const back = cleanString(pick(obj, 'back', 'answer', 'a', 'definition'));
  return front && back ? { front, back } : null;
}

/** Validates and normalizes an already-parsed object into a StudyPack. */
export function coerceStudyPack(value: unknown): StudyPack {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new StudyPackParseError('Model response was not a JSON object.');
  }
  const obj = value as Record<string, unknown>;

  const summary = cleanString(pick(obj, 'summary', 'Summary'));

  const rawTerms = pick(obj, 'keyTerms', 'key_terms', 'terms');
  const keyTerms = dedupeCaseInsensitive(Array.isArray(rawTerms) ? rawTerms.map(cleanString) : []);

  const rawCards = pick(obj, 'cards', 'flashcards');
  const cards = Array.isArray(rawCards)
    ? rawCards.map(coerceCard).filter((c): c is Card => c !== null)
    : [];

  if (!summary && cards.length === 0) {
    throw new StudyPackParseError('Model response had no summary and no usable flashcards.');
  }
  return { summary, keyTerms, cards };
}

/**
 * Parses raw model text (possibly fenced or chatty) into a StudyPack. Tries the
 * fenced block first, then the raw text (a "```" inside a JSON string would
 * otherwise cut the payload), and every `{` in turn so stray braces or small
 * unrelated objects in leading chatter don't hide the real one.
 */
export function parseStudyPack(raw: string): StudyPack {
  let sawBalanced = false;
  let shapeError: StudyPackParseError | undefined;
  for (const text of new Set([stripCodeFences(raw), raw])) {
    for (let from = text.indexOf('{'); from !== -1; from = text.indexOf('{', from + 1)) {
      const json = extractFirstJsonObject(text, from);
      if (json === null) continue; // unbalanced from here; a later `{` may still close
      sawBalanced = true;
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        continue;
      }
      try {
        return coerceStudyPack(parsed);
      } catch (err) {
        // Valid JSON but not a study pack (e.g. `{}` in chatter). Remember the
        // outermost complaint and keep looking.
        if (!(err instanceof StudyPackParseError)) throw err;
        shapeError ??= err;
      }
    }
  }
  if (shapeError) throw shapeError;
  if (sawBalanced) throw new StudyPackParseError('Model response contained malformed JSON.');
  throw new StudyPackParseError(
    raw.includes('{')
      ? 'Model response contained incomplete JSON (it may have been cut off).'
      : 'Model response did not contain a JSON object.',
  );
}
