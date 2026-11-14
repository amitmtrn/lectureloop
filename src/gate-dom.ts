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

export type PathLabel = 'on_device' | 'in_cloud' | 'failed' | 'unknown';

const PATH_BADGE: Record<PathLabel, { text: string; cls: string }> = {
  on_device: { text: 'ON-DEVICE', cls: 'chip chip-device' },
  in_cloud: { text: 'CLOUD', cls: 'chip chip-cloud' },
  failed: { text: 'FAILED', cls: 'chip chip-failed' },
  unknown: { text: 'UNKNOWN', cls: 'chip chip-unknown' },
};

/** Teal for on-device, violet for cloud, always with the word. */
export function pathBadge(path: PathLabel): HTMLSpanElement {
  const { text, cls } = PATH_BADGE[path];
  return el('span', cls, text);
}

const STAMPS = {
  correct: { icon: '✓', text: 'CORRECT' },
  partial: { icon: '◐', text: 'PARTIAL' },
  missed: { icon: '✕', text: 'MISSED' },
} as const;

export function verdictStamp(verdict: keyof typeof STAMPS): HTMLSpanElement {
  const { icon, text } = STAMPS[verdict];
  return el('span', `stamp stamp-${verdict}`, `${icon} ${text}`);
}
