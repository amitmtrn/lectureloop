import { describe, expect, it } from 'vitest';
import {
  coerceStudyPack,
  extractFirstJsonObject,
  parseStudyPack,
  StudyPackParseError,
  stripCodeFences,
} from '../src/parse';

const valid = {
  summary: 'Plants turn light into chemical energy.',
  keyTerms: ['chlorophyll', 'ATP'],
  cards: [{ front: 'Where does photosynthesis happen?', back: 'In chloroplasts.' }],
};

describe('stripCodeFences', () => {
  it('removes ```json fences', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('leaves unfenced text alone', () => {
    expect(stripCodeFences('  {"a":1} ')).toBe('{"a":1}');
  });
});

describe('extractFirstJsonObject', () => {
  it('finds the first balanced object amid chatter', () => {
    expect(extractFirstJsonObject('Sure! {"a":{"b":2}} and {"c":3}')).toBe('{"a":{"b":2}}');
  });
  it('ignores braces inside strings', () => {
    expect(extractFirstJsonObject('{"a":"}{\\"x"}')).toBe('{"a":"}{\\"x"}');
  });
  it('returns null when unbalanced or absent', () => {
    expect(extractFirstJsonObject('{"a":1')).toBeNull();
    expect(extractFirstJsonObject('no json')).toBeNull();
  });
});

describe('parseStudyPack', () => {
  it('parses plain JSON', () => {
    expect(parseStudyPack(JSON.stringify(valid))).toEqual(valid);
  });

  it('parses fenced JSON with surrounding prose', () => {
    const raw = `Here you go:\n\`\`\`json\n${JSON.stringify(valid, null, 2)}\n\`\`\`\nHope it helps!`;
    expect(parseStudyPack(raw)).toEqual(valid);
  });

  it('trims, drops bad cards and dedupes key terms', () => {
    const pack = parseStudyPack(
      JSON.stringify({
        summary: '  Light   reactions\nmake ATP. ',
        keyTerms: [' ATP ', 'atp', '', 42, null, 'Calvin cycle'],
        cards: [
          { front: ' Q1 ', back: ' A1 ' },
          { front: '', back: 'no front' },
          { front: 'no back' },
          'not a card',
          null,
          { question: 'Q2', answer: 'A2' },
        ],
      }),
    );
    expect(pack).toEqual({
      summary: 'Light reactions make ATP.',
      keyTerms: ['ATP', '42', 'Calvin cycle'],
      cards: [
        { front: 'Q1', back: 'A1' },
        { front: 'Q2', back: 'A2' },
      ],
    });
  });

  it('accepts alternative key names', () => {
    const pack = parseStudyPack(
      '{"summary":"S","key_terms":["x"],"flashcards":[{"term":"t","definition":"d"}]}',
    );
    expect(pack).toEqual({ summary: 'S', keyTerms: ['x'], cards: [{ front: 't', back: 'd' }] });
  });

  it('allows a pack with cards but no summary', () => {
    expect(parseStudyPack('{"cards":[{"front":"f","back":"b"}]}').summary).toBe('');
  });

  it('throws a clear error when unusable', () => {
    expect(() => parseStudyPack('I cannot help with that.')).toThrow(StudyPackParseError);
    expect(() => parseStudyPack('{"summary": "x",}')).toThrow(/malformed JSON/);
    expect(() => parseStudyPack('{"keyTerms":["a"]}')).toThrow(
      /no summary and no usable flashcards/,
    );
    expect(() => coerceStudyPack([1, 2])).toThrow(/not a JSON object/);
  });

  it('skips stray braces in leading chatter', () => {
    expect(parseStudyPack(`Sure {here} is it: ${JSON.stringify(valid)}`)).toEqual(valid);
    expect(parseStudyPack(`Unclosed { brace, then ${JSON.stringify(valid)}`)).toEqual(valid);
  });

  it('handles ``` inside a JSON string (unfenced and fenced)', () => {
    const pack = { ...valid, summary: 'Wrap code in ```js fences``` when writing Markdown.' };
    expect(parseStudyPack(JSON.stringify(pack))).toEqual(pack);
    expect(parseStudyPack(`\`\`\`json\n${JSON.stringify(pack)}\n\`\`\``)).toEqual(pack);
  });

  it('skips parseable objects that are not a study pack', () => {
    expect(parseStudyPack(`Sure {} here: ${JSON.stringify(valid)}`)).toEqual(valid);
    expect(parseStudyPack(`{"note":"draft"}\n${JSON.stringify(valid)}`)).toEqual(valid);
  });

  it('unwraps a pack nested in a wrapper object or array', () => {
    expect(parseStudyPack(JSON.stringify({ studyPack: valid }))).toEqual(valid);
    expect(parseStudyPack(JSON.stringify([valid]))).toEqual(valid);
  });

  it('reports truncated output as incomplete', () => {
    const cut = JSON.stringify(valid).slice(0, 30);
    expect(() => parseStudyPack(cut)).toThrow(/incomplete JSON/);
    expect(() => parseStudyPack(cut)).toThrow(StudyPackParseError);
  });
});
