import { describe, expect, it } from 'vitest';
import { chunkText, DEFAULT_CHUNK_TOKENS, estimateTokens } from '../src/chunk';

const para = (n: number, word = 'leaf'): string =>
  Array.from({ length: n }, (_, i) => `${word}${i} grows.`).join(' ');

describe('estimateTokens', () => {
  it('uses ~4 chars per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('chunkText', () => {
  it('returns no chunks for blank text', () => {
    expect(chunkText('  \n\n  ')).toEqual([]);
  });

  it('keeps short text as one chunk', () => {
    expect(chunkText('One.\n\nTwo.')).toEqual(['One.\n\nTwo.']);
  });

  it('keeps the default budget well under the on-device context', () => {
    expect(DEFAULT_CHUNK_TOKENS).toBeLessThanOrEqual(4500);
  });

  it('splits on paragraph boundaries and respects the budget', () => {
    const paragraphs = [para(10, 'a'), para(10, 'b'), para(10, 'c')];
    const maxTokens = Math.ceil((paragraphs[0]!.length * 2 + 2) / 4);
    const chunks = chunkText(paragraphs.join('\n\n'), maxTokens);
    expect(chunks).toEqual([`${paragraphs[0]}\n\n${paragraphs[1]}`, paragraphs[2]]);
    for (const c of chunks) expect(estimateTokens(c)).toBeLessThanOrEqual(maxTokens);
  });

  it('splits an oversized paragraph on sentence boundaries', () => {
    const text = para(200);
    const chunks = chunkText(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(200);
      expect(c.endsWith('grows.')).toBe(true);
    }
    expect(chunks.join(' ')).toBe(text);
  });

  it('splits a run-on sentence on word boundaries, never mid-word', () => {
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`);
    const chunks = chunkText(words.join(' '), 25);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
    expect(chunks.join(' ').split(' ')).toEqual(words);
  });

  it('hard-splits a single giant word', () => {
    const giant = 'x'.repeat(250);
    const chunks = chunkText(`small ${giant} tail`, 25);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
    expect(chunks.join('')).toContain('x'.repeat(100));
    expect(chunks.join('').replace(/[^x]/g, '').length).toBe(250);
  });

  it('normalizes Windows line endings', () => {
    expect(chunkText('A.\r\n\r\nB.')).toEqual(['A.\n\nB.']);
  });

  it('budgets non-ASCII text at ~1 token per character', () => {
    expect(estimateTokens('שלום')).toBe(4);
    const hebrew = Array.from({ length: 400 }, () => 'זהו משפט בעברית על פוטוסינתזה.').join(' ');
    const chunks = chunkText(hebrew, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(estimateTokens(c)).toBeLessThanOrEqual(1000);
    // English keeps the 4 chars/token budget.
    expect(chunkText('word '.repeat(800), 1000)).toHaveLength(1);
  });
});
