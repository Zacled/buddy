/**
 * HumanType Pro — Keyboard geometry.
 *
 * When a human mistypes, the wrong key is almost always physically adjacent to
 * the intended one on a QWERTY layout. This module maps each key to its
 * neighbours so `generateTypo()` produces *believable* mistakes (e.g. "teh"
 * for "the", "hellp" for "hello") rather than random noise.
 */

/** Adjacency map for the QWERTY layout (lower-case). */
const QWERTY_NEIGHBOURS: Record<string, string> = {
  q: 'wa',
  w: 'qase',
  e: 'wsdr',
  r: 'edft',
  t: 'rfgy',
  y: 'tghu',
  u: 'yhji',
  i: 'ujko',
  o: 'iklp',
  p: 'ol',
  a: 'qwsz',
  s: 'awedxz',
  d: 'serfcx',
  f: 'drtgvc',
  g: 'ftyhbv',
  h: 'gyujnb',
  j: 'huikmn',
  k: 'jiolm',
  l: 'kop',
  z: 'asx',
  x: 'zsdc',
  c: 'xdfv',
  v: 'cfgb',
  b: 'vghn',
  n: 'bhjm',
  m: 'njk',
};

/**
 * Return a plausible "fat-finger" substitute for `char`, preserving case.
 * Falls back to the original character when we have no neighbour data (e.g.
 * digits, symbols, whitespace) so the caller can simply skip the typo.
 */
export function nearbyKey(char: string): string | null {
  const lower = char.toLowerCase();
  const neighbours = QWERTY_NEIGHBOURS[lower];
  if (!neighbours) return null;

  const replacement = neighbours[Math.floor(Math.random() * neighbours.length)];
  // Preserve the original casing of the intended character.
  return char === char.toUpperCase() && char !== lower
    ? replacement.toUpperCase()
    : replacement;
}

/** Characters that warrant a slight slow-down (end of clause / sentence). */
const PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':', '—', '…', ')', ']', '}']);

/** Characters that end a sentence and deserve a longer "breath". */
const SENTENCE_END = new Set(['.', '!', '?', '…']);

export function isPunctuation(char: string): boolean {
  return PUNCTUATION.has(char);
}

export function isSentenceEnd(char: string): boolean {
  return SENTENCE_END.has(char);
}

/** Letters can be mistyped; whitespace/punctuation generally are not. */
export function isTypoCandidate(char: string): boolean {
  return /[a-z]/i.test(char) && QWERTY_NEIGHBOURS[char.toLowerCase()] !== undefined;
}
