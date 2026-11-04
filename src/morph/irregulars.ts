import type { CellId, ParadigmId } from './types.ts';

export interface KnownIrregular {
  cells: Partial<Record<CellId, string>>;
  note: string;
  /** Apply only when the word is inferred into this paradigm (guards homographs). */
  paradigm?: ParadigmId;
  /** Stored on the lemma as `notes` when the source gives none (for facts the paradigm doesn't model). */
  lemmaNote?: string;
}

/**
 * Known lexical irregularities that the regular rules cannot produce.
 * Keyed by NFC first principal part. Inference attaches these as `irregular`.
 */
export const KNOWN_IRREGULAR: Record<string, KnownIrregular> = {
  dō: {
    // dare has short a throughout except dās and the imperative dā (A&G §202).
    cells: { 'pres.act.ind.2sg': 'dās', 'pres.act.imp.2sg': 'dā' },
    note: 'Stem vowel short (damus, datis, dant, dare) except dās, dā.',
    paradigm: 'v1',
  },
  meus: {
    // Vocative masculine singular of meus is mī (A&G §145).
    cells: { 'voc.sg.m': 'mī' },
    note: 'Voc. masc. sg. mī.',
    paradigm: 'adj12',
  },
  fīlia: {
    // Wheelock ch. 3: dat. and abl. pl. fīliābus, to distinguish from fīliīs (fīlius).
    cells: { 'dat.pl': 'fīliābus', 'abl.pl': 'fīliābus' },
    note: 'Dat./abl. pl. fīliābus.',
    paradigm: 'n1',
  },
  deus: {
    // Wheelock ch. 6; A&G §49 g: voc. sg. deus; nom./voc. pl. dī, dat./abl. pl. dīs.
    // The later plurals deī / deīs are not generated (one form per cell); deī stays gen. sg.
    cells: { 'voc.sg': 'deus', 'nom.pl': 'dī', 'voc.pl': 'dī', 'dat.pl': 'dīs', 'abl.pl': 'dīs' },
    note: 'Voc. sg. deus; nom. pl. dī (also deī), dat./abl. pl. dīs (also deīs).',
    paradigm: 'n2m',
  },
  dea: {
    // Wheelock ch. 6: dat. and abl. pl. deābus (like fīliābus).
    cells: { 'dat.pl': 'deābus', 'abl.pl': 'deābus' },
    note: 'Dat./abl. pl. deābus.',
    paradigm: 'n1',
  },
  audeō: {
    // Semi-deponent (A&G §192): regular 2nd-conj. present system; perfect ausus sum (not generated yet).
    cells: {},
    note: 'Semi-deponent: perfect ausus sum.',
    paradigm: 'v2',
    lemmaNote: 'Semi-deponent: perfect ausus sum',
  },
  // Short imperatives (A&G §182; Wheelock ch. 8). Compounds of dūcō and dīcō are handled by rule in infer.ts;
  // compounds of faciō that weaken a to i (cōnficiō) have the regular -ice imperative.
  dūcō: { cells: { 'pres.act.imp.2sg': 'dūc' }, note: 'Imperative sg. dūc.', paradigm: 'v3' },
  dīcō: { cells: { 'pres.act.imp.2sg': 'dīc' }, note: 'Imperative sg. dīc.', paradigm: 'v3' },
  faciō: { cells: { 'pres.act.imp.2sg': 'fac' }, note: 'Imperative sg. fac.', paradigm: 'v3io' },
  locus: {
    // Wheelock ch. 9; A&G §106 b: pl. loca, locōrum, n. (places, region) beside locī, m. (passages in books).
    // One form per cell: nom./acc./voc. pl. use the common neuter loca; gen./dat./abl. pl. locōrum, locīs serve both.
    cells: { 'nom.pl': 'loca', 'acc.pl': 'loca', 'voc.pl': 'loca' },
    note: 'Pl. loca, n. (places, region); also locī, m. (passages in literature), not generated.',
    paradigm: 'n2m',
    lemmaNote: 'Pl. usually loca, locōrum, n., places, region; locī, locōrum, m., passages in literature',
  },
  bōs: {
    // A&G §79: gen. pl. boum, dat./abl. pl. bōbus (or būbus).
    cells: { 'gen.pl': 'boum', 'dat.pl': 'bōbus', 'abl.pl': 'bōbus' },
    note: 'Gen. pl. boum; dat./abl. pl. bōbus (also būbus).',
    paradigm: 'n3',
  },
  os: {
    // os, ossis (bone): neuter with gen. pl. ossium (A&G §76 n.); nom./acc. pl. ossa.
    cells: { 'gen.pl': 'ossium' },
    note: 'Gen. pl. ossium.',
    paradigm: 'n3n',
  },
  famēs: {
    // famēs, famis: abl. sg. famē, a 5th-declension form (A&G §79).
    cells: { 'abl.sg': 'famē' },
    note: 'Abl. sg. famē.',
    paradigm: 'n3i',
  },
};
