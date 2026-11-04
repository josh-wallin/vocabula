import { describe, expect, it } from 'vitest';
import { generate } from '../src/morph/generate.ts';
import { L, nounTable } from './helpers.ts';

describe('1st declension', () => {
  it('porta, portae, f.', () => {
    expect(generate(L('porta, portae, f.', 'noun'))).toEqual(nounTable(
      ['porta', 'portae', 'portae', 'portam', 'portā', 'porta'],
      ['portae', 'portārum', 'portīs', 'portās', 'portīs', 'portae']));
  });
  it('nauta, nautae, m. (masculine, same endings)', () => {
    const l = L('nauta, nautae, m.', 'noun');
    expect(l.gender).toBe('m');
    expect(generate(l)['abl.sg']).toBe('nautā');
  });
});

describe('2nd declension masculine', () => {
  it('amīcus, amīcī, m. (voc. -e)', () => {
    expect(generate(L('amīcus, amīcī, m.', 'noun'))).toEqual(nounTable(
      ['amīcus', 'amīcī', 'amīcō', 'amīcum', 'amīcō', 'amīce'],
      ['amīcī', 'amīcōrum', 'amīcīs', 'amīcōs', 'amīcīs', 'amīcī']));
  });
  it('puer, puerī, m. (keeps e; voc. = nom.)', () => {
    expect(generate(L('puer, puerī, m.', 'noun'))).toEqual(nounTable(
      ['puer', 'puerī', 'puerō', 'puerum', 'puerō', 'puer'],
      ['puerī', 'puerōrum', 'puerīs', 'puerōs', 'puerīs', 'puerī']));
  });
  it('ager, agrī, m. (drops e; voc. = nom.)', () => {
    expect(generate(L('ager, agrī, m.', 'noun'))).toEqual(nounTable(
      ['ager', 'agrī', 'agrō', 'agrum', 'agrō', 'ager'],
      ['agrī', 'agrōrum', 'agrīs', 'agrōs', 'agrīs', 'agrī']));
  });
  it('fīlius, fīliī, m. (gen. fīliī, voc. fīlī, gen. pl. fīliōrum)', () => {
    expect(generate(L('fīlius, fīliī, m.', 'noun'))).toEqual(nounTable(
      ['fīlius', 'fīliī', 'fīliō', 'fīlium', 'fīliō', 'fīlī'],
      ['fīliī', 'fīliōrum', 'fīliīs', 'fīliōs', 'fīliīs', 'fīliī']));
  });
  it('vir, virī, m.', () => {
    expect(generate(L('vir, virī, m.', 'noun'))).toEqual(nounTable(
      ['vir', 'virī', 'virō', 'virum', 'virō', 'vir'],
      ['virī', 'virōrum', 'virīs', 'virōs', 'virīs', 'virī']));
  });
});

describe('2nd declension neuter', () => {
  it('dōnum, dōnī, n.', () => {
    expect(generate(L('dōnum, dōnī, n.', 'noun'))).toEqual(nounTable(
      ['dōnum', 'dōnī', 'dōnō', 'dōnum', 'dōnō', 'dōnum'],
      ['dōna', 'dōnōrum', 'dōnīs', 'dōna', 'dōnīs', 'dōna']));
  });
  it('cōnsilium, cōnsiliī, n. (gen. pl. cōnsiliōrum)', () => {
    expect(generate(L('cōnsilium, cōnsiliī, n.', 'noun'))).toEqual(nounTable(
      ['cōnsilium', 'cōnsiliī', 'cōnsiliō', 'cōnsilium', 'cōnsiliō', 'cōnsilium'],
      ['cōnsilia', 'cōnsiliōrum', 'cōnsiliīs', 'cōnsilia', 'cōnsiliīs', 'cōnsilia']));
  });
});

describe('lexical overrides', () => {
  it('fīlia: dat./abl. pl. fīliābus', () => {
    const p = generate(L('fīlia, fīliae, f.', 'noun'));
    expect(p['dat.pl']).toBe('fīliābus');
    expect(p['abl.pl']).toBe('fīliābus');
    expect(p['gen.pl']).toBe('fīliārum');
  });
});
