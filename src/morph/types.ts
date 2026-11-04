/** Core morphology types. Pure data; no UI, no storage. */

export type PartOfSpeech =
  | 'noun' | 'verb' | 'adj' | 'adv' | 'pron' | 'prep' | 'conj' | 'interj' | 'num' | 'phrase';

export type Gender = 'm' | 'f' | 'n';

/**
 * Paradigm ids:
 *  v1, v2     – 1st/2nd conjugation, present active system (pres./fut./impf. ind., inf., imp.)
 *  v3         – 3rd conjugation (agō, agere), present active system
 *  v3io       – 3rd conjugation -iō (capiō, capere), present active system
 *  v4         – 4th conjugation (audiō, audīre), present active system
 *  n1         – 1st declension
 *  n2m        – 2nd declension -us / -er / -ir / -ius nouns (masc., rarely fem.)
 *  n2n        – 2nd declension neuters in -um / -ium
 *  n3         – 3rd declension consonant stems, masc./fem. (rēx, rēgis)
 *  n3n        – 3rd declension consonant stems, neuter (corpus, corporis)
 *  n3i        – 3rd declension i-stems, masc./fem. (hostis, urbs: gen. pl. -ium)
 *  n3in       – 3rd declension i-stems, neuter in -e, -al, -ar (mare, animal)
 *  adj12      – 1st/2nd declension adjectives (-us,-a,-um and -er,-(e)ra,-(e)rum)
 *  irr:sum    – sum, esse (present, future, imperfect indicative + infinitive)
 *  irr:possum – possum, posse (present, future, imperfect indicative + infinitive)
 *  indecl     – indeclinable (only the citation form)
 */
export type ParadigmId =
  | 'v1' | 'v2' | 'v3' | 'v3io' | 'v4'
  | 'n1' | 'n2m' | 'n2n' | 'n3' | 'n3n' | 'n3i' | 'n3in'
  | 'adj12' | 'irr:sum' | 'irr:possum' | 'indecl';

export type Case = 'nom' | 'gen' | 'dat' | 'acc' | 'abl' | 'voc';
export type GramNumber = 'sg' | 'pl';
export type Person = '1sg' | '2sg' | '3sg' | '1pl' | '2pl' | '3pl';

/** Noun cell, e.g. "nom.sg", "acc.pl". */
export type NounCell = `${Case}.${GramNumber}`;
/** Adjective cell, e.g. "nom.sg.m", "abl.pl.f". */
export type AdjCell = `${Case}.${GramNumber}.${Gender}`;
/** Indicative tenses of the present system. */
export type Tense = 'pres' | 'fut' | 'impf';
/** Verb cells (present active system: present, future, imperfect indicative; infinitive; imperative). */
export type VerbCell =
  | `${Tense}.act.ind.${Person}`
  | 'pres.act.inf'
  | 'pres.act.imp.2sg'
  | 'pres.act.imp.2pl';
/** Used by indeclinables. */
export type CitationCell = 'citation';

export type CellId = NounCell | AdjCell | VerbCell | CitationCell;

export interface Source {
  book: 'wheelock';
  chapter: number;
  order: number;
  /** The form printed in the list if it differs from the lemma (e.g. "est" for sum). */
  as?: string;
}

export interface Lemma {
  /** Stable ASCII id, e.g. "laudo-v1". */
  id: string;
  /** Headword as printed (macrons, NFC). */
  headword: string;
  /**
   * Principal parts / citation forms:
   *   noun: [nom.sg, gen.sg]   (nom.pl, gen.pl for plural-only nouns)
   *   verb: [1sg, infinitive, perfect?, supine?]
   *   adj:  [masc, fem, neut] nominative (sg., or pl. when number = 'pl')
   */
  parts: string[];
  pos: PartOfSpeech;
  gender?: Gender;
  paradigm: ParadigmId;
  gloss: string;
  sources: Source[];
  /** Cell overrides that replace generated forms (e.g. dō: dās, dā). */
  irregular?: Partial<Record<CellId, string>>;
  /** DCC Latin Core Vocabulary data (CC BY-SA 3.0, dcc.dickinson.edu), when the word is on that list. */
  dcc?: { rank: number; semanticGroup?: string; headword: string };
  /** 'pl' for words used only/usually in the plural (paucī). */
  number?: 'pl';
  notes?: string;
}

export type Paradigm = Partial<Record<CellId, string>>;
