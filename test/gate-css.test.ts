import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('gate.css colour use (R1.3)', () => {
  it('does not use the teal or violet routing hues in the page background', () => {
    const css = readFileSync('src/gate.css', 'utf8');
    const body = /body\.gate\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(body).toContain('background');
    expect(body).not.toMatch(/45 212 191|167 139 250|2dd4bf|a78bfa|var\(--(device|cloud)\)/i);
  });
});
