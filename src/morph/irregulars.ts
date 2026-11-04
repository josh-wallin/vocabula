import type { CellId } from './types.ts';

/**
 * Known lexical irregularities that the regular rules cannot produce.
 * Keyed by NFC first principal part. Inference attaches these as `irregular`.
 */
export const KNOWN_IRREGULAR: Record<string, { cells: Partial<Record<CellId, string>>; note: string }> = {
  dō: {
    // dare has short a throughout except dās and the imperative dā (A&G §202).
    cells: { 'pres.act.ind.2sg': 'dās', 'pres.act.imp.2sg': 'dā' },
    note: 'Stem vowel short (damus, datis, dant, dare) except dās, dā.',
  },
  meus: {
    // Vocative masculine singular of meus is mī (A&G §145).
    cells: { 'voc.sg.m': 'mī' },
    note: 'Voc. masc. sg. mī.',
  },
  fīlia: {
    // Wheelock ch. 3: dat. and abl. pl. fīliābus, to distinguish from fīliīs (fīlius).
    cells: { 'dat.pl': 'fīliābus', 'abl.pl': 'fīliābus' },
    note: 'Dat./abl. pl. fīliābus.',
  },
};
