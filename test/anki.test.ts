import { describe, expect, it } from 'vitest';
import { toAnkiTxt } from '../src/anki';

describe('toAnkiTxt', () => {
  it('writes the Anki headers even with no cards', () => {
    expect(toAnkiTxt([])).toBe('#separator:tab\n#html:false\n#columns:Front\tBack\n');
  });

  it('writes one tab-separated line per card and sanitizes fields', () => {
    const out = toAnkiTxt([
      { front: 'What is\tATP?', back: 'An energy\ncarrier.\r\nMade in light reactions.' },
      { front: 'Stroma', back: 'Fluid around thylakoids' },
      { front: '  ', back: 'dropped' },
    ]);
    const lines = out.trimEnd().split('\n');
    expect(lines.slice(3)).toEqual([
      'What is ATP?\tAn energy carrier. Made in light reactions.',
      'Stroma\tFluid around thylakoids',
    ]);
    for (const line of lines.slice(3)) expect(line.split('\t')).toHaveLength(2);
  });

  it('quotes fields with double quotes or a leading # so Anki reads them verbatim', () => {
    const out = toAnkiTxt([
      { front: 'What does "cogito" mean?', back: 'I think.' },
      { front: '#include does what?', back: 'Pulls in a "header" file.' },
    ]);
    expect(out.trimEnd().split('\n').slice(3)).toEqual([
      '"What does ""cogito"" mean?"\tI think.',
      '"#include does what?"\t"Pulls in a ""header"" file."',
    ]);
  });
});
