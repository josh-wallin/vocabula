/** Vowel quantity helpers. All strings are handled in NFC (precomposed macrons). */

const LONG_TO_SHORT: Record<string, string> = {
  ā: 'a', ē: 'e', ī: 'i', ō: 'o', ū: 'u', ȳ: 'y',
  Ā: 'A', Ē: 'E', Ī: 'I', Ō: 'O', Ū: 'U', Ȳ: 'Y',
};

const VOWELS = new Set('aeiouyāēīōūȳAEIOUYĀĒĪŌŪȲ');

export const nfc = (s: string): string => s.normalize('NFC');

export const isVowel = (ch: string | undefined): boolean => ch !== undefined && VOWELS.has(ch);
export const isLong = (ch: string | undefined): boolean => ch !== undefined && ch in LONG_TO_SHORT;
export const shorten = (ch: string): string => LONG_TO_SHORT[ch] ?? ch;

/** Remove all macrons (for lenient matching / ids). Also strips other combining marks. */
export function stripMacrons(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

/**
 * Join a stem and an ending, applying the Latin rule that a long vowel
 * shortens before another vowel, before final -m, -r, -t, and before nt / nd.
 * Only the stem-final vowel (the junction) is affected, so lexical long
 * vowels inside the stem (e.g. nūntiat) are left alone.
 */
export function join(stem: string, ending: string): string {
  stem = nfc(stem);
  ending = nfc(ending);
  const last = stem.slice(-1);
  if (isLong(last) && shortensBefore(ending)) {
    return stem.slice(0, -1) + shorten(last) + ending;
  }
  return stem + ending;
}

function shortensBefore(ending: string): boolean {
  if (ending === '') return false;
  if (isVowel(ending[0])) return true;
  if (ending === 'm' || ending === 'r' || ending === 't') return true;
  return ending.startsWith('nt') || ending.startsWith('nd');
}
