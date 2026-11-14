export function $<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export type Tone = 'ok' | 'warn' | 'bad' | 'off';

/** A label/value row for a `<dl>`. The tone prefix is a text glyph, so colour is never the only cue. */
export function statusRow(label: string, value: string, tone: Tone): HTMLDivElement {
  const row = el('div');
  const dd = el('dd', `s-${tone}`, value);
  row.append(el('dt', undefined, label), dd);
  return row;
}
