/**
 * Loose Bible reference detector. Matches:
 *   "John 14:6", "1 John 4:8", "Psalm 23", "Psalm 23:1-3",
 *   "Song of Solomon 2:10", "Revelation 21:4".
 * Books are matched non-strictly (any sequence of letters/spaces of length 3-21);
 * the server is the source of truth and will reject malformed refs.
 */
export const BIBLE_REF = /\b(?:[1-3]\s)?[A-Za-z][A-Za-z ]{2,20}\s+\d{1,3}(?::\d{1,3}(?:-\d{1,3})?)?\b/;

export function looksLikeBibleRef(text: string): boolean {
  return BIBLE_REF.test(text);
}
