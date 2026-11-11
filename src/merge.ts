import { dedupeCaseInsensitive } from './parse';
import type { Card, StudyPack } from './types';

/** Normalizes a card front for duplicate detection. */
export function normalizeFront(front: string): string {
  return front
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministically merges per-chunk packs: summaries joined as paragraphs in
 * chunk order, key terms deduped case-insensitively, cards deduped by
 * normalized front (first occurrence wins).
 */
export function mergeStudyPacks(packs: StudyPack[]): StudyPack {
  const summary = packs
    .map((p) => p.summary.trim())
    .filter(Boolean)
    .join('\n\n');

  const keyTerms = dedupeCaseInsensitive(packs.flatMap((p) => p.keyTerms.map((t) => t.trim())));

  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const card of packs.flatMap((p) => p.cards)) {
    const key = normalizeFront(card.front);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cards.push(card);
  }
  return { summary, keyTerms, cards };
}
