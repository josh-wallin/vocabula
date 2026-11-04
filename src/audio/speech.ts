/**
 * Text pre-processing before eSpeak NG's Latin voice ("la", restored classical
 * pronunciation). Deterministic and versioned: a change here must bump AUDIO_ENGINE
 * in key.ts (p1 = this version), so clips are regenerated under new keys.
 *
 * eSpeak "la" already gives: c = /k/, v = /w/, ae = /ai/, au, oe, gn = /ŋn/, qu = /kw/,
 * ph/th/ch aspirated, macrons → long vowels, penult-law stress (macrons count), and a
 * geminate /jj/ for intervocalic i (cuius, huius, maior, eius, Gāius).
 *
 * What we fix:
 *  - consonantal i at the start of a word before a vowel (iam → jam; eSpeak reads iam as
 *    two syllables), and after a prefix in compounds (adiuvō → adjuvō, coniungō, iniūria,
 *    obiectus; obiciō → objiciō: written i there stands for /jj/). Vocalic forms of eō
 *    (iit, iēns, ieram…) stay vocalic: only i + a vowel other than i is touched, plus a short list.
 *  - eu is a hiatus except in heu, seu, ceu, neu, neuter (and Greek Eu-): eSpeak makes every eu
 *    a diphthong (deus as one syllable), so it gets a diaeresis (deüs → /ˈde.us/).
 *  - hyphens (the enclitic headwords -que, -ne) are dropped.
 *
 * Known gaps (not fixed): final -m is not nasalized (rosam = /rosam/, not /rosã/); no
 * elision across words; deinde is stressed de-ín-de (classical déinde, ei a diphthong);
 * coniungō gets initial stress (should be con-iún-gō); cui and huic are two syllables (classical
 * monosyllables with the diphthong ui); single words sometimes carry only
 * secondary stress (eius, mihi); the r is a tap/trill mix.
 */
const V = 'aeouāēōūy';
/** Vocalic i + vowel at the start of a word (forms of eō and a few others). */
const VOCALIC_INITIAL = new Set(['iēns', 'ientis', 'ienti', 'ientem', 'iente', 'ientēs', 'ientium', 'ientibus', 'ieram', 'ierās', 'ierat', 'ierāmus', 'ierātis', 'ierant', 'ierō', 'ieris', 'ierit', 'ierimus', 'ieritis', 'ierint', 'iērunt', 'ierim', 'ierīs', 'iō']);
const PREFIX = '(?:ab|ad|con|dis|ē|in|ob|re|sub)';
const PREFIX_I_VOWEL = new RegExp(`^(${PREFIX})i(?=[${V}])`, 'iu');
/** Compounds of iaciō: obiciō = ob-jiciō. */
const PREFIX_ICIO = new RegExp(`^(${PREFIX}|dē|prō|trā)ic(?=[iīeē])`, 'iu');
/** Words the prefix rule must leave alone (vocalic i after what looks like a prefix). */
const PREFIX_EXCEPT = new Set(['abiēs', 'abietis', 'adiēns', 'subiēns', 'obiēns', 'rei', 'reī']);

/** Real eu diphthongs; everywhere else eu is two syllables (de-us, me-us, e-um, e-unt). */
const EU_DIPHTHONG = /^(heu|ēheu|eheu|seu|ceu|neu|neut.*|eur.*|euc.*|eup.*)$/u;

/** eSpeak reads every eu as a diphthong; a diaeresis (deüs) makes it a hiatus. */
export function euHiatus(word: string): string {
  return EU_DIPHTHONG.test(word.toLowerCase()) ? word : word.replace(/([eE])u/gu, '$1ü');
}

export function consonantalI(word: string): string {
  const lower = word.toLowerCase();
  if (VOCALIC_INITIAL.has(lower)) return word;
  let w = word;
  const initial = new RegExp(`^([iI])(?=[${V}])`, 'u');
  w = w.replace(initial, (m) => (m === 'I' ? 'J' : 'j'));
  if (!PREFIX_EXCEPT.has(lower)) {
    w = w.replace(PREFIX_ICIO, '$1jic');
    w = w.replace(PREFIX_I_VOWEL, '$1j');
  }
  return w;
}

/** The text eSpeak is given for a clip's (normalized) text. */
export function espeakInput(text: string): string {
  const t = text.normalize('NFC').replace(/(^|\s)-(?=\p{L})/gu, '$1').replace(/(\p{L})-(?=\p{L})/gu, '$1').replace(/\s+/g, ' ').trim();
  return t.replace(/\p{L}+/gu, (w) => euHiatus(consonantalI(w)));
}
