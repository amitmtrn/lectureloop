/**
 * Cheap heuristic: does the text contain a meaningful share of letters from
 * non-Latin scripts (Hebrew, Arabic, Cyrillic, CJK, ...)? Gemini Nano on-device
 * only supports English, so we warn the user.
 */
export function looksNonEnglish(text: string, threshold = 0.15): boolean {
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length < 20) return false;
  const nonLatin = letters.filter((ch) => !/\p{Script=Latin}/u.test(ch)).length;
  return nonLatin / letters.length >= threshold;
}
