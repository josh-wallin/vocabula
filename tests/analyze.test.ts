import { describe, expect, it } from 'vitest';
import { analyze, FormIndex } from '../src/morph/analyze.ts';
import { L } from './helpers.ts';

const lemmas = [
  L('puella, puellae, f.', 'noun'),
  L('porta, portae, f.', 'noun'),
  L('amīcus, amīcī, m.', 'noun'),
  L('magnus, magna, magnum', 'adj'),
  L('laudō, laudāre, laudāvī, laudātum', 'verb'),
];
const cells = (form: string, opts = {}) =>
  analyze(form, lemmas, opts).map((a) => `${a.lemma.id}:${a.cell}`).sort();

describe('analyze', () => {
  it('puellae → gen.sg, dat.sg, nom.pl, voc.pl', () => {
    expect(cells('puellae')).toEqual(
      ['puella-n1:dat.sg', 'puella-n1:gen.sg', 'puella-n1:nom.pl', 'puella-n1:voc.pl']);
  });
  it('portīs → dat.pl, abl.pl', () => {
    expect(cells('portīs')).toEqual(['porta-n1:abl.pl', 'porta-n1:dat.pl']);
  });
  it('macrons are significant by default: porta ≠ portā', () => {
    expect(cells('porta')).toEqual(['porta-n1:nom.sg', 'porta-n1:voc.sg']);
    expect(cells('portā')).toEqual(['porta-n1:abl.sg']);
  });
  it('ignoreMacrons merges portā into porta', () => {
    expect(cells('porta', { ignoreMacrons: true })).toEqual(
      ['porta-n1:abl.sg', 'porta-n1:nom.sg', 'porta-n1:voc.sg']);
  });
  it('magnum spans genders', () => {
    expect(cells('magnum')).toEqual(
      ['magnus-adj12:acc.sg.m', 'magnus-adj12:acc.sg.n', 'magnus-adj12:nom.sg.n', 'magnus-adj12:voc.sg.n']);
  });
  it('verb forms', () => {
    expect(cells('laudā')).toEqual(['laudo-v1:pres.act.imp.2sg']);
    expect(cells('laudat')).toEqual(['laudo-v1:pres.act.ind.3sg']);
  });
  it('unknown form → []', () => {
    expect(cells('rēgis')).toEqual([]);
  });
  it('FormIndex agrees with analyze', () => {
    const idx = new FormIndex(lemmas);
    expect(idx.lookup('amīcī').map((a) => a.cell).sort()).toEqual(['gen.sg', 'nom.pl', 'voc.pl']);
  });
});
