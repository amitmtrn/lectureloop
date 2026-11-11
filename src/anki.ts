import type { Card } from './types';

/** Tabs and newlines would break Anki's tab-separated format. */
function sanitizeField(value: string): string {
  return value
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Anki's importer parses CSV-style: a field starting with `"` is read as a
 * quoted field, and a line starting with `#` is a comment. Quote such fields
 * and double any inner quotes so they import verbatim.
 */
function quoteField(value: string): string {
  return value.includes('"') || value.startsWith('#') ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Builds an Anki-importable plain-text file (File > Import in Anki). */
export function toAnkiTxt(cards: Card[]): string {
  const lines = ['#separator:tab', '#html:false', '#columns:Front\tBack'];
  for (const card of cards) {
    const front = sanitizeField(card.front);
    const back = sanitizeField(card.back);
    if (front && back) lines.push(`${quoteField(front)}\t${quoteField(back)}`);
  }
  return `${lines.join('\n')}\n`;
}
