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

describe('analyze: Wheelock chs. 5–8 forms', () => {
  const lex = [
    L('rēx, rēgis, m.', 'noun'),
    L('regō, regere, rēxī, rēctum', 'verb'),
    L('corpus, corporis, n.', 'noun'),
    L('agō, agere, ēgī, āctum', 'verb'),
    L('dūcō, dūcere, dūxī, ductum', 'verb'),
    L('capiō, capere, cēpī, captum', 'verb'),
    L('audiō, audīre, audīvī, audītum', 'verb'),
    L('sum, esse, fuī, futūrum', 'verb'),
    L('possum, posse, potuī', 'verb'),
    L('laudō, laudāre, laudāvī, laudātum', 'verb'),
    L('moneō, monēre, monuī, monitum', 'verb'),
  ];
  const an = (form: string, opts = {}) => analyze(form, lex, opts).map((a) => `${a.lemma.id}:${a.cell}`).sort();

  it('agam is only future 1sg (the subjunctive is not modelled)', () => {
    expect(an('agam')).toEqual(['ago-v3:fut.act.ind.1sg']);
  });
  it('3rd-conj. future vs present: agēs / agis, aget / agit, agent / agunt', () => {
    expect(an('agēs')).toEqual(['ago-v3:fut.act.ind.2sg']);
    expect(an('agis')).toEqual(['ago-v3:pres.act.ind.2sg']);
    expect(an('aget')).toEqual(['ago-v3:fut.act.ind.3sg']);
    expect(an('agent')).toEqual(['ago-v3:fut.act.ind.3pl']);
    expect(an('agunt')).toEqual(['ago-v3:pres.act.ind.3pl']);
  });
  it('-bō / -bam tenses of 1st and 2nd conjugation', () => {
    expect(an('laudābis')).toEqual(['laudo-v1:fut.act.ind.2sg']);
    expect(an('laudābās')).toEqual(['laudo-v1:impf.act.ind.2sg']);
    expect(an('monēbunt')).toEqual(['moneo-v2:fut.act.ind.3pl']);
    expect(an('monēbant')).toEqual(['moneo-v2:impf.act.ind.3pl']);
  });
  it('sum and possum', () => {
    expect(an('erit')).toEqual(['sum-irr-sum:fut.act.ind.3sg']);
    expect(an('erant')).toEqual(['sum-irr-sum:impf.act.ind.3pl']);
    expect(an('potest')).toEqual(['possum-irr-possum:pres.act.ind.3sg']);
    expect(an('poterunt')).toEqual(['possum-irr-possum:fut.act.ind.3pl']);
    expect(an('posse')).toEqual(['possum-irr-possum:pres.act.inf']);
  });
  it('rēgis (gen. sg. of rēx) and regis (you rule) are distinct with macrons', () => {
    expect(an('rēgis')).toEqual(['rex-n3:gen.sg']);
    expect(an('regis')).toEqual(['rego-v3:pres.act.ind.2sg']);
    expect(an('rēge')).toEqual(['rex-n3:abl.sg']);
    expect(an('rege')).toEqual(['rego-v3:pres.act.imp.2sg']);
  });
  it('… and merge when macrons are ignored', () => {
    expect(an('regis', { ignoreMacrons: true })).toEqual(['rego-v3:pres.act.ind.2sg', 'rex-n3:gen.sg']);
    expect(an('reges', { ignoreMacrons: true })).toEqual(['rego-v3:fut.act.ind.2sg', 'rex-n3:acc.pl', 'rex-n3:nom.pl', 'rex-n3:voc.pl']);
  });
  it('3rd-decl. syncretism: rēgēs (nom./acc./voc. pl.), rēgibus (dat./abl. pl.), corpus (nom./acc./voc. sg.)', () => {
    expect(an('rēgēs')).toEqual(['rex-n3:acc.pl', 'rex-n3:nom.pl', 'rex-n3:voc.pl']);
    expect(an('rēgibus')).toEqual(['rex-n3:abl.pl', 'rex-n3:dat.pl']);
    expect(an('corpus')).toEqual(['corpus-n3n:acc.sg', 'corpus-n3n:nom.sg', 'corpus-n3n:voc.sg']);
    expect(an('corpora')).toEqual(['corpus-n3n:acc.pl', 'corpus-n3n:nom.pl', 'corpus-n3n:voc.pl']);
  });
  it('dūc is the imperative; *dūce is not generated', () => {
    expect(an('dūc')).toEqual(['duco-v3:pres.act.imp.2sg']);
    expect(an('dūce')).toEqual([]);
  });
  it('capiam / audiam / audit / audiunt', () => {
    expect(an('capiam')).toEqual(['capio-v3io:fut.act.ind.1sg']);
    expect(an('capiunt')).toEqual(['capio-v3io:pres.act.ind.3pl']);
    expect(an('audiam')).toEqual(['audio-v4:fut.act.ind.1sg']);
    expect(an('audit')).toEqual(['audio-v4:pres.act.ind.3sg']);
    expect(an('audiunt')).toEqual(['audio-v4:pres.act.ind.3pl']);
  });
  it('FormIndex agrees with analyze on the new cells', () => {
    const idx = new FormIndex(lex, { ignoreMacrons: true });
    for (const f of ['regis', 'agam', 'poterat', 'corpora', 'audiebam']) {
      expect(idx.lookup(f).map((a) => `${a.lemma.id}:${a.cell}`).sort()).toEqual(an(f, { ignoreMacrons: true }));
    }
  });
});
