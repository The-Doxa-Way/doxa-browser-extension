/**
 * Bible reference detection and extraction.
 *
 * looksLikeBibleRef is a loose containment test (any ref-shaped substring).
 * extractBibleRef pulls the actual reference out of a larger selection by
 * anchoring each chapter[:verse] token to a known book name immediately
 * before it, so "He quoted John 3:16 to me" yields "John 3:16". The server
 * remains the source of truth and rejects anything malformed.
 */

export const BIBLE_REF = /\b(?:[1-3]\s)?[A-Za-z][A-Za-z ]{2,20}\s+\d{1,3}(?::\d{1,3}(?:-\d{1,3})?)?\b/;

export function looksLikeBibleRef(text: string): boolean {
  return BIBLE_REF.test(text);
}

/** Canonical book names (lowercase), including numbered books and common variants. */
const BOOKS = new Set([
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua',
  'judges', 'ruth', '1 samuel', '2 samuel', '1 kings', '2 kings',
  '1 chronicles', '2 chronicles', 'ezra', 'nehemiah', 'esther', 'job',
  'psalm', 'psalms', 'proverbs', 'ecclesiastes', 'song of solomon',
  'song of songs', 'isaiah', 'jeremiah', 'lamentations', 'ezekiel', 'daniel',
  'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah', 'nahum', 'habakkuk',
  'zephaniah', 'haggai', 'zechariah', 'malachi', 'matthew', 'mark', 'luke',
  'john', 'acts', 'romans', '1 corinthians', '2 corinthians', 'galatians',
  'ephesians', 'philippians', 'colossians', '1 thessalonians',
  '2 thessalonians', '1 timothy', '2 timothy', 'titus', 'philemon',
  'hebrews', 'james', '1 peter', '2 peter', '1 john', '2 john', '3 john',
  'jude', 'revelation',
]);

/** Longest book name is "song of solomon" (3 words) plus a leading number. */
const MAX_BOOK_WORDS = 4;

/** Reference length cap documented by the doxa_scripture tool schema. */
const MAX_REF_LENGTH = 100;

/**
 * Extract the first Bible reference from a selection, or undefined.
 * Falls back to the whole (short) selection when no known book anchors a
 * match, so unusual phrasings still reach the server for the final verdict.
 */
export function extractBibleRef(text: string): string | undefined {
  for (const m of text.matchAll(/\d{1,3}(?::\d{1,3}(?:-\d{1,3})?)?/g)) {
    const before = text.slice(0, m.index).trimEnd();
    if (before.length === 0) continue;
    const words = before.split(/\s+/);
    for (let n = Math.min(MAX_BOOK_WORDS, words.length); n >= 1; n--) {
      const candidate = words.slice(-n).join(' ');
      if (BOOKS.has(candidate.toLowerCase())) {
        return `${candidate} ${m[0]}`;
      }
    }
  }
  const trimmed = text.trim();
  if (trimmed.length <= MAX_REF_LENGTH && BIBLE_REF.test(trimmed)) return trimmed;
  return undefined;
}
