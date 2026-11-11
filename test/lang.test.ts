import { describe, expect, it } from 'vitest';
import { looksNonEnglish } from '../src/lang';
import { SAMPLE_LECTURE } from '../src/sample';

describe('looksNonEnglish', () => {
  it('accepts English text', () => {
    expect(looksNonEnglish(SAMPLE_LECTURE)).toBe(false);
  });
  it('flags mostly non-Latin text', () => {
    expect(looksNonEnglish('פוטוסינתזה היא התהליך שבו צמחים הופכים אור לאנרגיה כימית')).toBe(true);
    expect(looksNonEnglish('Фотосинтез — это процесс превращения света в химическую энергию')).toBe(
      true,
    );
  });
  it('ignores very short text and a stray foreign word', () => {
    expect(looksNonEnglish('שלום')).toBe(false);
    expect(looksNonEnglish(`${SAMPLE_LECTURE} שלום`)).toBe(false);
  });
});
