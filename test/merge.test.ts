import { describe, expect, it } from 'vitest';
import { mergeStudyPacks, normalizeFront } from '../src/merge';

describe('normalizeFront', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normalizeFront('  What is  ATP? ')).toBe(normalizeFront('what is atp'));
  });
});

describe('mergeStudyPacks', () => {
  it('returns an empty pack for no input', () => {
    expect(mergeStudyPacks([])).toEqual({ summary: '', keyTerms: [], cards: [] });
  });

  it('joins summaries, dedupes terms case-insensitively and cards by front', () => {
    const merged = mergeStudyPacks([
      {
        summary: 'Part one.',
        keyTerms: ['Chlorophyll', 'ATP'],
        cards: [
          { front: 'What is ATP?', back: 'An energy carrier.' },
          { front: 'Where are thylakoids?', back: 'In chloroplasts.' },
        ],
      },
      { summary: '  ', keyTerms: [], cards: [] },
      {
        summary: 'Part two.',
        keyTerms: ['atp', 'Rubisco', 'chlorophyll'],
        cards: [
          { front: 'what is ATP', back: 'Duplicate with different wording.' },
          { front: 'What does rubisco do?', back: 'Fixes carbon dioxide.' },
        ],
      },
    ]);
    expect(merged).toEqual({
      summary: 'Part one.\n\nPart two.',
      keyTerms: ['Chlorophyll', 'ATP', 'Rubisco'],
      cards: [
        { front: 'What is ATP?', back: 'An energy carrier.' },
        { front: 'Where are thylakoids?', back: 'In chloroplasts.' },
        { front: 'What does rubisco do?', back: 'Fixes carbon dioxide.' },
      ],
    });
  });
});
