/**
 * The lexicon the path is built from: the private Wheelock lemmas (from the
 * imported content pack) plus the public DCC core list, with duplicates merged
 * so a word in both is taught once, in Wheelock's spelling. Familia Rōmāna preview
 * entries (optional, from the pack) attach to the same Word when it is the same word,
 * and otherwise become meaning-only 'fr' words.
 */
import type { Lemma } from '../morph/types.ts';
import { stripMacrons } from '../morph/phonology.ts';
import type { FrEntry } from '../data/fr.ts';

export type Origin = 'wheelock' | 'dcc' | 'fr';

export interface Word {
  lemma: Lemma;
  origin: Origin;
  /** Wheelock chapter that introduces the word (first source), or null for DCC-only / FR-only words. */
  chapter: number | null;
  /** Familia Rōmāna chapter whose preview lesson shows the word (meaning only), if any. */
  fr?: { chapter: number; order: number };
}

export interface Lexicon {
  words: Word[];
  byId: Map<string, Word>;
  /** DCC-only words (not in the Wheelock list), by DCC rank. */
  dccOnly: Word[];
  /** FR-only words (on neither list): taught for meaning only, never class or forms. */
  frOnly: Word[];
}

/** Matching key for "the same word": macron-stripped first citation form + paradigm. */
export const matchKey = (l: Lemma): string =>
  `${stripMacrons(l.parts[0] ?? l.headword).toLowerCase()}|${l.paradigm}`;

export const firstChapter = (l: Lemma): number | null =>
  l.sources.reduce<number | null>((m, s) => (m === null || s.chapter < m ? s.chapter : m), null);

export function buildLexicon(wheelock: readonly Lemma[], dcc: readonly Lemma[], fr: readonly FrEntry[] = []): Lexicon {
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
  // FR previews: the same word (lemma id, else spelling + paradigm, else DCC rank) shares its
  // Word, so its FSRS cards are shared; Wheelock's or DCC's spelling and gloss win, as for magnus.
  const allKeys = new Map<string, Word>();
  const byRank = new Map<number, Word>();
  for (const w of words) {
    if (!allKeys.has(matchKey(w.lemma))) allKeys.set(matchKey(w.lemma), w);
    if (w.lemma.dcc && !byRank.has(w.lemma.dcc.rank)) byRank.set(w.lemma.dcc.rank, w);
  }
  const frOnly: Word[] = [];
  for (const e of [...fr].sort((a, b) => a.chapter - b.chapter || a.order - b.order)) {
    // Provisional FR ids (pronouns, numerals, irregular verbs with no paradigm yet) match by id only.
    const provisional = e.lemma.id.includes('-fr-');
    const hit = byId.get(e.lemma.id) ?? (provisional ? undefined : allKeys.get(matchKey(e.lemma)))
      ?? (e.dccRank !== undefined && byRank.get(e.dccRank)?.lemma.pos === e.lemma.pos ? byRank.get(e.dccRank) : undefined);
    if (hit) {
      hit.fr ??= { chapter: e.chapter, order: e.order };
      continue;
    }
    const w: Word = { lemma: e.lemma, origin: 'fr', chapter: null, fr: { chapter: e.chapter, order: e.order } };
    words.push(w);
    byId.set(e.lemma.id, w);
    frOnly.push(w);
  }
  return { words, byId, dccOnly, frOnly };
}


/** Dictionary-style citation for display: "puella, puellae" / "amō, amāre" / "magnus, magna, magnum". */
export function citation(l: Lemma): string {
  switch (l.paradigm) {
    case 'v1': case 'v2': case 'v3': case 'v3io': case 'v4': case 'irr:sum': case 'irr:possum': return `${l.parts[0]}, ${l.parts[1]}`;
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
    case 'v3': return '3rd conjugation';
    case 'v3io': return '3rd conjugation (-iō)';
    case 'v4': return '4th conjugation';
    case 'n1': return '1st declension';
    case 'n2m': case 'n2n': return '2nd declension';
    case 'n3': case 'n3n': return '3rd declension';
    case 'n3i': case 'n3in': return '3rd declension (i-stem)';
    case 'adj12': return l.number === 'pl' ? 'adjective, 1st/2nd declension (plural)' : 'adjective, 1st/2nd declension';
    case 'irr:sum': case 'irr:possum': return 'irregular verb';
    case 'indecl': return POS_LABEL[l.pos] ?? l.pos;
  }
}

export const POS_LABEL: Record<string, string> = {
  noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb', pron: 'pronoun',
  prep: 'preposition', conj: 'conjunction', interj: 'interjection', num: 'numeral', phrase: 'phrase',
};

/** Normalized gloss for "is this the same meaning?" comparisons. */
export const glossKey = (g: string): string => g.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
