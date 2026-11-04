/**
 * Classical-Latin pseudo-orthography for LLM text-to-speech.
 *
 * Based on Ciletti, "Prompting the Muse: Generating Prosodically-Correct Latin Speech
 * with Large Language Models" (ACL 2025 SRW, https://aclanthology.org/2025.acl-srw.48),
 * which fed gpt-4o-mini-tts respelled verse: c → k before front vowels, qu → kw,
 * ae/oe → ai/oi, ge/gi → ghe/ghi, and the stressed (ictic) syllable upper-cased with a
 * grave accent on its vowel. The paper marks verse ictus; here we mark *word* stress
 * (penult law), since the app reads prose. Extensions beyond the paper (the owner's
 * brief): every c (not only before e/i) → k, consonantal v → w, consonantal i → y
 * (yy between vowels: cuius → kuyyus), long vowels doubled (ā → aa), ph/th/ch → p/t/k
 * (unaspirated, so the engine doesn't say English f/θ), x → ks, ngu+vowel → ngw.
 *
 * Pure: no DOM, no Worker APIs. Input is NFC-normalized; macrons mark long vowels.
 */

type Seg =
  | { k: 'V'; out: string; heavy: boolean }
  /** A consonant. `stop`/`liquid` drive the muta-cum-liquida rule; `h` never makes position. */
  | { k: 'C'; out: string; stop?: boolean; liquid?: boolean; h?: boolean };

const LONG: Record<string, string> = { ā: 'a', ē: 'e', ī: 'i', ō: 'o', ū: 'u', ȳ: 'y' };
const SHORT_V = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
const isVowelCh = (c: string | undefined): boolean => c !== undefined && (SHORT_V.has(c) || c in LONG);
const FRONT = new Set(['e', 'i', 'ē', 'ī', 'y', 'ȳ']);
const STOPS = new Set(['b', 'c', 'd', 'g', 'k', 'p', 't']);

/** Greek y (upsilon) is [y]; written ü so the engine doesn't read it as English y. */
const vowelOut = (base: string, long: boolean): string => {
  const v = base === 'y' ? 'ü' : base;
  return long ? v + v : v;
};

/** Split one lower-case word into segments. */
export function segment(word: string): Seg[] {
  const w = word.normalize('NFC').toLowerCase();
  const out: Seg[] = [];
  const prevIsVowel = () => out.length > 0 && out[out.length - 1]!.k === 'V';
  let i = 0;
  while (i < w.length) {
    const c = w[i]!;
    const n = w[i + 1];
    // qu: one consonant [kʷ]
    if (c === 'q' && n === 'u') { out.push({ k: 'C', out: 'kw', stop: true }); i += 2; continue; }
    // ngu + vowel: lingua, sanguis → ngw
    if (c === 'g' && n === 'u' && out.length > 0 && out[out.length - 1]!.out === 'n' && isVowelCh(w[i + 2])) {
      out.push({ k: 'C', out: 'gw', stop: true }); i += 2; continue;
    }
    // aspirates: ph th ch → p t k (one consonant)
    if ((c === 'p' || c === 't' || c === 'c') && n === 'h') {
      out.push({ k: 'C', out: c === 'c' ? 'k' : c, stop: true }); i += 2; continue;
    }
    // diphthongs ae oe au (both members short-written)
    if ((c === 'a' && (n === 'e' || n === 'u')) || (c === 'o' && n === 'e')) {
      out.push({ k: 'V', out: c + (n === 'u' ? 'u' : 'i'), heavy: true }); i += 2; continue;
    }
    // consonantal i: word-initial before a vowel (iam, Iūlius), or between vowels (cuius,
    // Trōia), where it is geminate [jj] and makes the preceding syllable heavy.
    if (c === 'i' && isVowelCh(n)) {
      if (i === 0) { out.push({ k: 'C', out: 'y' }); i++; continue; }
      if (prevIsVowel()) { out.push({ k: 'C', out: 'y' }, { k: 'C', out: 'y' }); i++; continue; }
    }
    if (isVowelCh(c)) {
      const long = c in LONG;
      out.push({ k: 'V', out: vowelOut(LONG[c] ?? c, long), heavy: long });
      i++; continue;
    }
    switch (c) {
      case 'v': out.push({ k: 'C', out: 'w' }); break;
      case 'j': out.push({ k: 'C', out: 'y' }); break;
      case 'c': case 'k': out.push({ k: 'C', out: 'k', stop: true }); break;
      case 'g': out.push({ k: 'C', out: n !== undefined && FRONT.has(n) ? 'gh' : 'g', stop: true }); break;
      case 'x': out.push({ k: 'C', out: 'k', stop: true }, { k: 'C', out: 's' }); break;
      case 'h': out.push({ k: 'C', out: 'h', h: true }); break;
      case 'l': case 'r': out.push({ k: 'C', out: c, liquid: true }); break;
      default: out.push({ k: 'C', out: c, stop: STOPS.has(c) });
    }
    i++;
  }
  return out;
}

export interface Syllable { segs: Seg[]; heavy: boolean }

/**
 * Syllables of one word. Between two vowels: one consonant goes with the next syllable;
 * of two or more, the last goes with the next syllable unless the last two are a stop +
 * l/r (muta cum liquida, prose usage: a-gri-co-la), which both go with it. h is ignored
 * when counting.
 */
export function syllabify(segs: Seg[]): Syllable[] {
  const vIdx = segs.map((s, i) => (s.k === 'V' ? i : -1)).filter((i) => i >= 0);
  if (vIdx.length === 0) return [{ segs, heavy: false }];
  const starts: number[] = [0];
  for (let j = 1; j < vIdx.length; j++) {
    const a = vIdx[j - 1]!, b = vIdx[j]!;
    const real = [] as number[]; // indices of non-h consonants between a and b
    for (let x = a + 1; x < b; x++) if (!(segs[x] as { h?: boolean }).h) real.push(x);
    let start: number;
    if (real.length <= 1) start = a + 1;
    else {
      const p = segs[real[real.length - 2]!]!, q = segs[real[real.length - 1]!]!;
      const mcl = p.k === 'C' && p.stop && q.k === 'C' && q.liquid;
      start = real[real.length - (mcl ? 2 : 1)]!;
      // an h right before the onset belongs to the onset
      while (start - 1 > a && (segs[start - 1] as { h?: boolean }).h) start--;
    }
    starts.push(start);
  }
  return starts.map((s, j) => {
    const e = j + 1 < starts.length ? starts[j + 1]! : segs.length;
    const part = segs.slice(s, e);
    const v = part.find((x) => x.k === 'V') as Extract<Seg, { k: 'V' }>;
    const coda = part.slice(part.indexOf(v) + 1).some((x) => x.k === 'C' && !x.h);
    return { segs: part, heavy: v.heavy || coda };
  });
}

/**
 * Index of the stressed syllable (penult law): 2 syllables → the first; 3+ → the penult if
 * heavy, else the antepenult. Monosyllables → 0.
 */
export function stressIndex(syls: readonly { heavy: boolean }[]): number {
  const n = syls.length;
  if (n <= 2) return 0;
  return syls[n - 2]!.heavy ? n - 2 : n - 3;
}

const GRAVE: Record<string, string> = { a: 'À', e: 'È', i: 'Ì', o: 'Ò', u: 'Ù' };

/** Upper-case a syllable and put a grave accent on its first vowel letter. */
function markStressed(s: string, vowelPos: number): string {
  const up = s.toUpperCase();
  const ch = s[vowelPos]!;
  const g = GRAVE[ch];
  return g ? up.slice(0, vowelPos) + g + up.slice(vowelPos + 1) : up;
}

/** Respell one word. Monosyllables carry no stress mark. */
export function pseudoWord(word: string): string {
  const syls = syllabify(segment(word));
  const st = syls.length > 1 ? stressIndex(syls) : -1;
  return syls.map((sy, j) => {
    let txt = '';
    let vpos = -1;
    for (const s of sy.segs) { if (s.k === 'V' && vpos < 0) vpos = txt.length; txt += s.out; }
    return j === st ? markStressed(txt, vpos) : txt;
  }).join('');
}

/** Respell a whole text; punctuation and spacing are kept as written. */
export function toPseudo(text: string): string {
  return text.normalize('NFC').replace(/\p{L}+/gu, (w) => pseudoWord(w));
}

/** The syllable string with the stressed one in capitals, e.g. "a·GRI·co·la" (tests, UI). */
export function showStress(word: string): string {
  const syls = syllabify(segment(word));
  const st = stressIndex(syls);
  return syls.map((sy, j) => {
    const t = sy.segs.map((s) => s.out).join('');
    return j === st && syls.length > 1 ? t.toUpperCase() : t;
  }).join('·');
}
