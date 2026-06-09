/**
 * HumanType Pro — Rewrite engine.
 *
 * A local, rule-based text improver. It cleans up writing the way a careful
 * editor would: normalising spacing and punctuation, fixing common
 * misspellings, removing accidental word repetition, trimming wordy phrases and
 * adjusting tone to a chosen style — all while preserving the author's meaning
 * and facts.
 *
 * Scope / honesty notes:
 *   • This runs entirely in the browser with no network calls and no AI model,
 *     so it performs surface-level edits, not deep paraphrasing.
 *   • It is a writing aid. It deliberately does NOT attempt to disguise text
 *     from AI-detection tools (no invisible characters, homoglyph swaps or
 *     error injection). Improving clarity is the only goal.
 */

export type RewriteStyle = 'professional' | 'formal' | 'academic' | 'casual' | 'concise';

export const REWRITE_STYLES: { value: RewriteStyle; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'formal', label: 'Formal' },
  { value: 'academic', label: 'Academic' },
  { value: 'casual', label: 'Casual' },
  { value: 'concise', label: 'Concise' },
];

// ---------------------------------------------------------------------------
// Lookup tables
// ---------------------------------------------------------------------------

/** Conservative spelling corrections (only unambiguous fixes). */
const MISSPELLINGS: Record<string, string> = {
  teh: 'the',
  recieve: 'receive',
  recieved: 'received',
  definately: 'definitely',
  seperate: 'separate',
  occured: 'occurred',
  untill: 'until',
  becuase: 'because',
  wich: 'which',
  thier: 'their',
  alot: 'a lot',
  alright: 'all right',
  goverment: 'government',
  enviroment: 'environment',
  neccessary: 'necessary',
  accomodate: 'accommodate',
  begining: 'beginning',
  beleive: 'believe',
  acheive: 'achieve',
  arguement: 'argument',
  consistant: 'consistent',
  independant: 'independent',
  occassion: 'occasion',
  publically: 'publicly',
  succesful: 'successful',
  tommorow: 'tomorrow',
  truely: 'truly',
  // Missing-apostrophe contractions (unambiguous cases only).
  dont: "don't",
  cant: "can't",
  wont: "won't",
  didnt: "didn't",
  doesnt: "doesn't",
  isnt: "isn't",
  arent: "aren't",
  wasnt: "wasn't",
  werent: "weren't",
  havent: "haven't",
  hasnt: "hasn't",
  hadnt: "hadn't",
  wouldnt: "wouldn't",
  couldnt: "couldn't",
  shouldnt: "shouldn't",
  youre: "you're",
  theyre: "they're",
};

/** Wordy phrase → tighter equivalent. Applied (mildly) to every style. */
const WORDY_PHRASES: [RegExp, string][] = [
  [/\bin order to\b/gi, 'to'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin the event that\b/gi, 'if'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bat the present time\b/gi, 'now'],
  [/\ba large number of\b/gi, 'many'],
  [/\ba majority of\b/gi, 'most'],
  [/\bwith regard to\b/gi, 'about'],
  [/\bwith reference to\b/gi, 'about'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\bin the process of\b/gi, ''],
  [/\bin spite of the fact that\b/gi, 'although'],
  [/\bon a regular basis\b/gi, 'regularly'],
  [/\bhas the ability to\b/gi, 'can'],
  [/\bis able to\b/gi, 'can'],
];

/** Extra reductions for the Concise style (more aggressive trimming). */
const CONCISE_EXTRAS: [RegExp, string][] = [
  [/\bin my opinion,?\s*/gi, ''],
  [/\bit is important to note that\b/gi, ''],
  [/\bneedless to say,?\s*/gi, ''],
  [/\bas a matter of fact,?\s*/gi, ''],
  [/\bthe fact of the matter is that\b/gi, ''],
  [/\bvery\s+/gi, ''],
  [/\breally\s+/gi, ''],
  [/\bquite\s+/gi, ''],
];

/** Casual filler / intensifier words removed for formal-family styles. */
const FILLERS: RegExp[] = [
  /\bbasically\b/gi,
  /\bactually\b/gi,
  /\bliterally\b/gi,
  /\bhonestly\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
  /\byou know\b/gi,
  /\bI mean\b/gi,
];

/** Contractions expanded for formal/academic/professional. */
const EXPANSIONS: [RegExp, string][] = [
  [/\bdon't\b/gi, 'do not'],
  [/\bdoesn't\b/gi, 'does not'],
  [/\bdidn't\b/gi, 'did not'],
  [/\bcan't\b/gi, 'cannot'],
  [/\bwon't\b/gi, 'will not'],
  [/\bwouldn't\b/gi, 'would not'],
  [/\bshouldn't\b/gi, 'should not'],
  [/\bcouldn't\b/gi, 'could not'],
  [/\bisn't\b/gi, 'is not'],
  [/\baren't\b/gi, 'are not'],
  [/\bwasn't\b/gi, 'was not'],
  [/\bweren't\b/gi, 'were not'],
  [/\bhaven't\b/gi, 'have not'],
  [/\bhasn't\b/gi, 'has not'],
  [/\bhadn't\b/gi, 'had not'],
  [/\bI'm\b/g, 'I am'],
  [/\byou're\b/gi, 'you are'],
  [/\bwe're\b/gi, 'we are'],
  [/\bthey're\b/gi, 'they are'],
  [/\bI've\b/g, 'I have'],
  [/\byou've\b/gi, 'you have'],
  [/\bwe've\b/gi, 'we have'],
  [/\bthey've\b/gi, 'they have'],
  [/\bI'll\b/g, 'I will'],
  [/\byou'll\b/gi, 'you will'],
  [/\bwe'll\b/gi, 'we will'],
  [/\bthey'll\b/gi, 'they will'],
  [/\bit's\b/gi, 'it is'],
  [/\bthat's\b/gi, 'that is'],
  [/\blet's\b/gi, 'let us'],
];

/** Contractions introduced for the Casual style. */
const CONTRACTIONS: [RegExp, string][] = [
  [/\bdo not\b/gi, "don't"],
  [/\bdoes not\b/gi, "doesn't"],
  [/\bdid not\b/gi, "didn't"],
  [/\bcannot\b/gi, "can't"],
  [/\bwill not\b/gi, "won't"],
  [/\bwould not\b/gi, "wouldn't"],
  [/\bshould not\b/gi, "shouldn't"],
  [/\bcould not\b/gi, "couldn't"],
  [/\bis not\b/gi, "isn't"],
  [/\bare not\b/gi, "aren't"],
  [/\bI am\b/g, "I'm"],
  [/\byou are\b/gi, "you're"],
  [/\bwe are\b/gi, "we're"],
  [/\bthey are\b/gi, "they're"],
  [/\bit is\b/gi, "it's"],
  [/\bthat is\b/gi, "that's"],
];

// ---------------------------------------------------------------------------
// Primitive transforms
// ---------------------------------------------------------------------------

/** Preserve the capitalisation of the matched word when substituting. */
function matchCase(replacement: string, original: string): string {
  if (original[0] === original[0]?.toUpperCase() && original[0] !== original[0]?.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function fixSpelling(text: string): string {
  let out = text;
  for (const [wrong, right] of Object.entries(MISSPELLINGS)) {
    const re = new RegExp(`\\b${wrong}\\b`, 'gi');
    out = out.replace(re, (m) => matchCase(right, m));
  }
  return out;
}

/** Collapse runs of whitespace and tidy blank lines (paragraphs preserved). */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

/** Normalise spacing around punctuation: none before, one after. */
function fixPunctuation(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, '$1') // no space before
    .replace(/([,;:])(?=\S)/g, '$1 ') // space after , ; :
    .replace(/([.!?])(?=[A-Za-z])/g, '$1 ') // space after sentence end
    .replace(/([.!?]){2,}/g, '$1') // collapse !! ?? .. (keep single)
    .replace(/\s{2,}/g, ' ');
}

/** Remove accidental immediate word repetition ("the the" → "the"). */
function dedupeWords(text: string): string {
  return text.replace(/\b(\w+)(\s+\1\b)+/gi, '$1');
}

/** Capitalise the first letter of every sentence and a standalone "i". */
function fixCapitalization(text: string): string {
  let out = text.replace(/\bi\b/g, 'I');
  // First letter of the whole text and after sentence-ending punctuation.
  out = out.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_m, lead, ch) => lead + ch.toUpperCase());
  return out;
}

function applyPairs(text: string, pairs: [RegExp, string][]): string {
  let out = text;
  for (const [re, replacement] of pairs) {
    out = out.replace(re, (m) => (replacement ? matchCase(replacement, m) : ''));
  }
  return out;
}

function removeFillers(text: string): string {
  let out = text;
  for (const re of FILLERS) out = out.replace(re, '');
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Improve `text` according to `style`, returning a cleaner version that keeps
 * the original meaning. Pure and synchronous.
 */
export function rewrite(text: string, style: RewriteStyle): string {
  if (!text.trim()) return '';

  let out = normalizeWhitespace(text);
  out = fixSpelling(out);
  out = dedupeWords(out);
  out = applyPairs(out, WORDY_PHRASES);

  switch (style) {
    case 'formal':
    case 'academic':
    case 'professional':
      out = applyPairs(out, EXPANSIONS);
      out = removeFillers(out);
      break;
    case 'casual':
      out = applyPairs(out, CONTRACTIONS);
      break;
    case 'concise':
      out = removeFillers(out);
      out = applyPairs(out, CONCISE_EXTRAS);
      break;
  }

  // Tidy up whatever the style edits left behind, then re-capitalise.
  out = fixPunctuation(out);
  out = normalizeWhitespace(out);
  out = fixCapitalization(out);
  return out;
}
