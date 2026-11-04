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

/* Third declension: Wheelock chs. 7 and 14; A&G §§56–78. */
describe('3rd declension consonant stems, masc./fem. (n3)', () => {
  it('rēx, rēgis, m.', () => {
    const l = L('rēx, rēgis, m.', 'noun');
    expect(l.paradigm).toBe('n3');
    expect(generate(l)).toEqual(nounTable(
      ['rēx', 'rēgis', 'rēgī', 'rēgem', 'rēge', 'rēx'],
      ['rēgēs', 'rēgum', 'rēgibus', 'rēgēs', 'rēgibus', 'rēgēs']));
  });
  it('homō, hominis, m.', () => {
    expect(generate(L('homō, hominis, m.', 'noun'))).toEqual(nounTable(
      ['homō', 'hominis', 'hominī', 'hominem', 'homine', 'homō'],
      ['hominēs', 'hominum', 'hominibus', 'hominēs', 'hominibus', 'hominēs']));
  });
  it('virtūs, virtūtis, f.', () => {
    expect(generate(L('virtūs, virtūtis, f.', 'noun'))).toEqual(nounTable(
      ['virtūs', 'virtūtis', 'virtūtī', 'virtūtem', 'virtūte', 'virtūs'],
      ['virtūtēs', 'virtūtum', 'virtūtibus', 'virtūtēs', 'virtūtibus', 'virtūtēs']));
  });
  it('amor, amōris, m. (short o in the nominative, long in the base)', () => {
    expect(generate(L('amor, amōris, m.', 'noun'))).toEqual(nounTable(
      ['amor', 'amōris', 'amōrī', 'amōrem', 'amōre', 'amor'],
      ['amōrēs', 'amōrum', 'amōribus', 'amōrēs', 'amōribus', 'amōrēs']));
  });
  it('cīvitās, cīvitātis, f.; pater, patris, m.; mōs, mōris, m.', () => {
    expect(generate(L('cīvitās, cīvitātis, f.', 'noun'))['acc.pl']).toBe('cīvitātēs');
    const pater = generate(L('pater, patris, m.', 'noun'));
    expect([pater['nom.sg'], pater['gen.sg'], pater['gen.pl'], pater['voc.sg']]).toEqual(['pater', 'patris', 'patrum', 'pater']);
    expect(generate(L('mōs, mōris, m.', 'noun'))['abl.pl']).toBe('mōribus');
  });
});

describe('3rd declension consonant stems, neuter (n3n)', () => {
  it('corpus, corporis, n. (nom. = acc. = voc.; pl. -a)', () => {
    const l = L('corpus, corporis, n.', 'noun');
    expect(l.paradigm).toBe('n3n');
    expect(generate(l)).toEqual(nounTable(
      ['corpus', 'corporis', 'corporī', 'corpus', 'corpore', 'corpus'],
      ['corpora', 'corporum', 'corporibus', 'corpora', 'corporibus', 'corpora']));
  });
  it('tempus, temporis, n.', () => {
    expect(generate(L('tempus, temporis, n.', 'noun'))).toEqual(nounTable(
      ['tempus', 'temporis', 'temporī', 'tempus', 'tempore', 'tempus'],
      ['tempora', 'temporum', 'temporibus', 'tempora', 'temporibus', 'tempora']));
  });
  it('nōmen, nōminis, n.', () => {
    expect(generate(L('nōmen, nōminis, n.', 'noun'))).toEqual(nounTable(
      ['nōmen', 'nōminis', 'nōminī', 'nōmen', 'nōmine', 'nōmen'],
      ['nōmina', 'nōminum', 'nōminibus', 'nōmina', 'nōminibus', 'nōmina']));
  });
  it('genus, generis, n.; iter, itineris, n.', () => {
    expect(generate(L('genus, generis, n.', 'noun'))['nom.pl']).toBe('genera');
    expect(generate(L('iter, itineris, n.', 'noun'))['abl.sg']).toBe('itinere');
  });
});

describe('3rd declension i-stems (n3i, n3in; Wheelock ch. 14)', () => {
  it('parisyllabic: cīvis, cīvis, m./f. → gen. pl. cīvium; common gender leaves gender unset', () => {
    const l = L('cīvis, cīvis, m./f.', 'noun');
    expect(l.paradigm).toBe('n3i');
    expect(l.gender).toBeUndefined();
    expect(generate(l)).toEqual(nounTable(
      ['cīvis', 'cīvis', 'cīvī', 'cīvem', 'cīve', 'cīvis'],
      ['cīvēs', 'cīvium', 'cīvibus', 'cīvēs', 'cīvibus', 'cīvēs']));
  });
  it('two consonants before the ending: urbs, urbis; nox, noctis; ars, artis', () => {
    expect(generate(L('urbs, urbis, f.', 'noun'))['gen.pl']).toBe('urbium');
    expect(generate(L('nox, noctis, f.', 'noun'))['gen.pl']).toBe('noctium');
    expect(generate(L('ars, artis, f.', 'noun'))).toEqual(nounTable(
      ['ars', 'artis', 'artī', 'artem', 'arte', 'ars'],
      ['artēs', 'artium', 'artibus', 'artēs', 'artibus', 'artēs']));
  });
  it('neuters in -e, -al: mare, maris; animal, animālis (abl. -ī, pl. -ia, -ium)', () => {
    const mare = L('mare, maris, n.', 'noun');
    expect(mare.paradigm).toBe('n3in');
    expect(generate(mare)).toEqual(nounTable(
      ['mare', 'maris', 'marī', 'mare', 'marī', 'mare'],
      ['maria', 'marium', 'maribus', 'maria', 'maribus', 'maria']));
    expect(generate(L('animal, animālis, n.', 'noun'))).toEqual(nounTable(
      ['animal', 'animālis', 'animālī', 'animal', 'animālī', 'animal'],
      ['animālia', 'animālium', 'animālibus', 'animālia', 'animālibus', 'animālia']));
  });
  it('consonant-stem exceptions to the rules: canis, iuvenis, senex, pater (gen. pl. -um)', () => {
    expect(L('canis, canis, m./f.', 'noun').paradigm).toBe('n3');
    expect(generate(L('iuvenis, iuvenis, m.', 'noun'))['gen.pl']).toBe('iuvenum');
    expect(generate(L('senex, senis, m.', 'noun'))['gen.pl']).toBe('senum');
    expect(L('pater, patris, m.', 'noun').paradigm).toBe('n3');
  });
  it('single consonant before the ending stays a consonant stem: dux, ducis; pēs, pedis', () => {
    expect(L('dux, ducis, m.', 'noun').paradigm).toBe('n3');
    expect(generate(L('pēs, pedis, m.', 'noun'))['gen.pl']).toBe('pedum');
  });
});

describe('3rd declension: plural-only nouns and lexical overrides', () => {
  it('māiōrēs, māiōrum, m. (plural only)', () => {
    const l = L('māiōrēs, māiōrum, m.', 'noun');
    expect(l).toMatchObject({ paradigm: 'n3', number: 'pl' });
    expect(generate(l)).toEqual({
      'nom.pl': 'māiōrēs', 'gen.pl': 'māiōrum', 'dat.pl': 'māiōribus', 'acc.pl': 'māiōrēs', 'abl.pl': 'māiōribus', 'voc.pl': 'māiōrēs',
    });
  });
  it('moenia, moenium, n. (plural-only i-stem)', () => {
    const l = L('moenia, moenium, n.', 'noun');
    expect(l).toMatchObject({ paradigm: 'n3in', number: 'pl' });
    expect(generate(l)['dat.pl']).toBe('moenibus');
  });
  it('bōs, bovis: boum, bōbus', () => {
    const p = generate(L('bōs, bovis, m.', 'noun'));
    expect([p['nom.pl'], p['gen.pl'], p['dat.pl'], p['abl.pl']]).toEqual(['bovēs', 'boum', 'bōbus', 'bōbus']);
  });
  it('os, ossis, n.: ossa but ossium; ōs, ōris, n. is regular', () => {
    const os = generate(L('os, ossis, n.', 'noun'));
    expect([os['nom.pl'], os['gen.pl']]).toEqual(['ossa', 'ossium']);
    expect(generate(L('ōs, ōris, n.', 'noun'))['gen.pl']).toBe('ōrum');
  });
  it('arma, armōrum, n. (plural-only 2nd-decl. neuter)', () => {
    const l = L('arma, armōrum, n.', 'noun');
    expect(l).toMatchObject({ paradigm: 'n2n', number: 'pl' });
    expect(generate(l)['abl.pl']).toBe('armīs');
  });
});

describe('Wheelock ch. 6 irregular nouns', () => {
  it('deus, deī, m.: voc. sg. deus; nom./voc. pl. dī; dat./abl. pl. dīs', () => {
    expect(generate(L('deus, deī, m.', 'noun'))).toEqual(nounTable(
      ['deus', 'deī', 'deō', 'deum', 'deō', 'deus'],
      ['dī', 'deōrum', 'dīs', 'deōs', 'dīs', 'dī']));
  });
  it('dea, deae, f.: dat./abl. pl. deābus', () => {
    expect(generate(L('dea, deae, f.', 'noun'))).toEqual(nounTable(
      ['dea', 'deae', 'deae', 'deam', 'deā', 'dea'],
      ['deae', 'deārum', 'deābus', 'deās', 'deābus', 'deae']));
  });
  it('īnsidiae, īnsidiārum, f. pl.: plural only, "f. pl." read as gender + number', () => {
    const l = L('īnsidiae, īnsidiārum, f. pl.', 'noun');
    expect(l).toMatchObject({ paradigm: 'n1', gender: 'f', number: 'pl', parts: ['īnsidiae', 'īnsidiārum'] });
    expect(generate(l)).toEqual({
      'nom.pl': 'īnsidiae', 'gen.pl': 'īnsidiārum', 'dat.pl': 'īnsidiīs', 'acc.pl': 'īnsidiās', 'abl.pl': 'īnsidiīs', 'voc.pl': 'īnsidiae',
    });
  });
});
