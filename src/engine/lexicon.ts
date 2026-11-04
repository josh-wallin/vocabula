/**
 * The lexicon the path is built from: the private Wheelock lemmas (from the
 * imported content pack) plus the public DCC core list, with duplicates merged
 * so a word in both is taught once, in Wheelock's spelling.
 */
import type { Lemma } from '../morph/types.ts';
import { stripMacrons } from '../morph/phonology.ts';

export type Origin = 'wheelock' | 'dcc';

export interface Word {
  lemma: Lemma;
  origin: Origin;
  /** Wheelock chapter that introduces the word (first source), or null for DCC-only words. */
  chapter: number | null;
}

export interface Lexicon {
  words: Word[];
  byId: Map<string, Word>;
  /** DCC-only words (not in the Wheelock list), by DCC rank. */
  dccOnly: Word[];
}

/** Matching key for "the same word": macron-stripped first citation form + paradigm. */
export const matchKey = (l: Lemma): string =>
  `${stripMacrons(l.parts[0] ?? l.headword).toLowerCase()}|${l.paradigm}`;

export const firstChapter = (l: Lemma): number | null =>
  l.sources.reduce<number | null>((m, s) => (m === null || s.chapter < m ? s.chapter : m), null);

export function buildLexicon(wheelock: readonly Lemma[], dcc: readonly Lemma[]): Lexicon {
  const words: Word[] = [];
  const byId = new Map<string, Word>();
  const wKeys = new Map<string, Word>();
  for (const l of wheelock) {
    const w: Word = { lemma: l, origin: 'wheelock', chapter: firstChapter(l) };
    words.push(w);
    byId.set(l.id, w);
    wKeys.set(matchKey(l), w);
  }
  const dccOnly: Word[] = [];
  for (const l of [...dcc].sort((a, b) => (a.dcc?.rank ?? 1e9) - (b.dcc?.rank ?? 1e9))) {
    const hit = wKeys.get(matchKey(l));
    if (hit) {
      // Keep Wheelock's spelling and gloss; remember the DCC rank.
      if (l.dcc && !hit.lemma.dcc) hit.lemma = { ...hit.lemma, dcc: l.dcc };
      continue;
    }
    if (byId.has(l.id)) continue;
    const w: Word = { lemma: l, origin: 'dcc', chapter: null };
    words.push(w);
    byId.set(l.id, w);
    dccOnly.push(w);
  }
  return { words, byId, dccOnly };
}

/** Dictionary-style citation for display: "puella, puellae" / "amō, amāre" / "magnus, magna, magnum". */
export function citation(l: Lemma): string {
  switch (l.paradigm) {
    case 'v1': case 'v2': case 'irr:sum': return `${l.parts[0]}, ${l.parts[1]}`;
    case 'adj12': return l.parts.slice(0, 3).join(', ');
    case 'indecl': return l.parts[0] ?? l.headword;
    default: return `${l.parts[0]}, ${l.parts[1]}`;
  }
}

/** Short description of a word's class: "1st declension", "2nd conjugation", "adjective (1st/2nd decl.)". */
export function classNote(l: Lemma): string {
  switch (l.paradigm) {
    case 'v1': return '1st conjugation';
    case 'v2': return '2nd conjugation';
    case 'n1': return '1st declension';
    case 'n2m': case 'n2n': return '2nd declension';
    case 'adj12': return l.number === 'pl' ? 'adjective, 1st/2nd declension (plural)' : 'adjective, 1st/2nd declension';
    case 'irr:sum': return 'irregular verb';
    case 'indecl': return POS_LABEL[l.pos] ?? l.pos;
  }
}

export const POS_LABEL: Record<string, string> = {
  noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb', pron: 'pronoun',
  prep: 'preposition', conj: 'conjunction', interj: 'interjection', num: 'numeral', phrase: 'phrase',
};

/** Normalized gloss for "is this the same meaning?" comparisons. */
export const glossKey = (g: string): string => g.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
