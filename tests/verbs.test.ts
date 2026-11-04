/**
 * Present-system verb paradigms, checked cell by cell against the standard
 * tables (Wheelock chs. 1, 5, 6, 8, 10; Allen & Greenough §§170–185, 170, 182).
 */
import { describe, expect, it } from 'vitest';
import { generate } from '../src/morph/generate.ts';
import { L, pickCells, tenseTable, verbTable } from './helpers.ts';

describe('1st conjugation: laudō, laudāre', () => {
  const laudō = L('laudō, laudāre, laudāvī, laudātum', 'verb');
  it('present, future and imperfect active indicative, infinitive, imperatives', () => {
    expect(generate(laudō)).toEqual(verbTable(
      ['laudō', 'laudās', 'laudat', 'laudāmus', 'laudātis', 'laudant'], 'laudāre', ['laudā', 'laudāte'], {
        fut: ['laudābō', 'laudābis', 'laudābit', 'laudābimus', 'laudābitis', 'laudābunt'],
        impf: ['laudābam', 'laudābās', 'laudābat', 'laudābāmus', 'laudābātis', 'laudābant'],
      }));
  });
  it('cells come in display order: present, infinitive, imperatives, future, imperfect', () => {
    const keys = Object.keys(generate(laudō));
    expect(keys.slice(0, 9).every((k) => k.startsWith('pres.'))).toBe(true);
    expect(keys.slice(9, 15).every((k) => k.startsWith('fut.'))).toBe(true);
    expect(keys.slice(15).every((k) => k.startsWith('impf.'))).toBe(true);
  });
});

describe('2nd conjugation: moneō, monēre', () => {
  it('present, future and imperfect active indicative, infinitive, imperatives', () => {
    expect(generate(L('moneō, monēre, monuī, monitum', 'verb'))).toEqual(verbTable(
      ['moneō', 'monēs', 'monet', 'monēmus', 'monētis', 'monent'], 'monēre', ['monē', 'monēte'], {
        fut: ['monēbō', 'monēbis', 'monēbit', 'monēbimus', 'monēbitis', 'monēbunt'],
        impf: ['monēbam', 'monēbās', 'monēbat', 'monēbāmus', 'monēbātis', 'monēbant'],
      }));
  });
  it('videō (stem vowel in root unaffected)', () => {
    expect(generate(L('videō, vidēre, vīdī, vīsum', 'verb'))).toEqual(verbTable(
      ['videō', 'vidēs', 'videt', 'vidēmus', 'vidētis', 'vident'], 'vidēre', ['vidē', 'vidēte'], {
        fut: ['vidēbō', 'vidēbis', 'vidēbit', 'vidēbimus', 'vidēbitis', 'vidēbunt'],
        impf: ['vidēbam', 'vidēbās', 'vidēbat', 'vidēbāmus', 'vidēbātis', 'vidēbant'],
      }));
  });
});

describe('dō, dare: irregular vowel length via overrides', () => {
  const dō = L('dō, dare, dedī, datum', 'verb');
  it('carries overrides from inference', () => {
    expect(dō.irregular).toEqual({ 'pres.act.ind.2sg': 'dās', 'pres.act.imp.2sg': 'dā' });
  });
  it('dās and dā long; damus, datis, dant, dat, dare, date short; dabō, dabam short', () => {
    expect(generate(dō)).toEqual(verbTable(
      ['dō', 'dās', 'dat', 'damus', 'datis', 'dant'], 'dare', ['dā', 'date'], {
        fut: ['dabō', 'dabis', 'dabit', 'dabimus', 'dabitis', 'dabunt'],
        impf: ['dabam', 'dabās', 'dabat', 'dabāmus', 'dabātis', 'dabant'],
      }));
  });
  it('without overrides the rules alone would give short das/da (proves overrides matter)', () => {
    const { irregular: _ignored, ...plain } = dō;
    const p = generate(plain);
    expect(p['pres.act.ind.2sg']).toBe('das');
    expect(p['pres.act.imp.2sg']).toBe('da');
  });
});

describe('sum, esse', () => {
  const sum = L('sum, esse, fuī, futūrum', 'verb');
  it('present, future, imperfect indicative and infinitive (no imperative)', () => {
    expect(generate(sum)).toEqual(verbTable(
      ['sum', 'es', 'est', 'sumus', 'estis', 'sunt'], 'esse', null, {
        fut: ['erō', 'eris', 'erit', 'erimus', 'eritis', 'erunt'],
        impf: ['eram', 'erās', 'erat', 'erāmus', 'erātis', 'erant'],
      }));
  });
});

describe('possum, posse (irr:possum)', () => {
  const possum = L('possum, posse, potuī', 'verb');
  it('is classified as irr:possum', () => {
    expect(possum.paradigm).toBe('irr:possum');
    expect(possum.id).toBe('possum-irr-possum');
  });
  it('pot- + sum, with pos- before s; infinitive posse', () => {
    expect(generate(possum)).toEqual(verbTable(
      ['possum', 'potes', 'potest', 'possumus', 'potestis', 'possunt'], 'posse', null, {
        fut: ['poterō', 'poteris', 'poterit', 'poterimus', 'poteritis', 'poterunt'],
        impf: ['poteram', 'poterās', 'poterat', 'poterāmus', 'poterātis', 'poterant'],
      }));
  });
});

describe('3rd conjugation: agō, agere', () => {
  const agō = L('agō, agere, ēgī, āctum', 'verb');
  it('is v3 with base ag-', () => {
    expect(agō.paradigm).toBe('v3');
    expect(agō.id).toBe('ago-v3');
  });
  it('present (short i, -unt), future -am/-ēs, imperfect -ēbam, infinitive -ere, imperative -e/-ite', () => {
    expect(generate(agō)).toEqual(verbTable(
      ['agō', 'agis', 'agit', 'agimus', 'agitis', 'agunt'], 'agere', ['age', 'agite'], {
        fut: ['agam', 'agēs', 'aget', 'agēmus', 'agētis', 'agent'],
        impf: ['agēbam', 'agēbās', 'agēbat', 'agēbāmus', 'agēbātis', 'agēbant'],
      }));
  });
  it('scrībō, trahō, vincō, discō, gerō (Wheelock ch. 8)', () => {
    const p = (hw: string) => generate(L(hw, 'verb'));
    expect(pickCells(p('scrībō, scrībere, scrīpsī, scrīptum'), 'pres.act.ind')).toEqual(
      tenseTable('pres', ['scrībō', 'scrībis', 'scrībit', 'scrībimus', 'scrībitis', 'scrībunt']));
    expect(pickCells(p('trahō, trahere, trāxī, trāctum'), 'fut.')).toEqual(
      tenseTable('fut', ['traham', 'trahēs', 'trahet', 'trahēmus', 'trahētis', 'trahent']));
    expect(pickCells(p('vincō, vincere, vīcī, victum'), 'impf.')).toEqual(
      tenseTable('impf', ['vincēbam', 'vincēbās', 'vincēbat', 'vincēbāmus', 'vincēbātis', 'vincēbant']));
    expect(p('discō, discere, didicī')['pres.act.imp.2sg']).toBe('disce');
    expect(p('gerō, gerere, gessī, gestum')['pres.act.imp.2pl']).toBe('gerite');
  });
  it('vowel-final base: metuō, metuere', () => {
    const p = generate(L('metuō, metuere, metuī', 'verb'));
    expect(pickCells(p, 'pres.act.ind')).toEqual(
      tenseTable('pres', ['metuō', 'metuis', 'metuit', 'metuimus', 'metuitis', 'metuunt']));
    expect(p['fut.act.ind.1sg']).toBe('metuam');
  });
});

describe('short imperatives dūc, dīc, fac (A&G §182)', () => {
  it('dūcō → dūc!, but dūcite and the rest regular', () => {
    const p = generate(L('dūcō, dūcere, dūxī, ductum', 'verb'));
    expect(p['pres.act.imp.2sg']).toBe('dūc');
    expect(p['pres.act.imp.2pl']).toBe('dūcite');
    expect(p['pres.act.ind.3pl']).toBe('dūcunt');
    expect(p['fut.act.ind.1sg']).toBe('dūcam');
  });
  it('dīcō → dīc!', () => {
    expect(generate(L('dīcō, dīcere, dīxī, dictum', 'verb'))['pres.act.imp.2sg']).toBe('dīc');
  });
  it('compounds of dūcō and dīcō keep the short form: ēdūc, ēdīc, addūc', () => {
    expect(generate(L('ēdūcō, ēdūcere', 'verb'))['pres.act.imp.2sg']).toBe('ēdūc');
    expect(generate(L('addūcō, addūcere', 'verb'))['pres.act.imp.2sg']).toBe('addūc');
    expect(generate(L('ēdīcō, ēdīcere', 'verb'))['pres.act.imp.2sg']).toBe('ēdīc');
  });
  it('faciō → fac!, but -ficiō compounds are regular (cōnfice)', () => {
    expect(generate(L('faciō, facere, fēcī, factum', 'verb'))['pres.act.imp.2sg']).toBe('fac');
    expect(generate(L('cōnficiō, cōnficere, cōnfēcī, cōnfectum', 'verb'))['pres.act.imp.2sg']).toBe('cōnfice');
  });
  it('other verbs are not affected (agō → age; 1st-conj. dicō is not dīcō)', () => {
    expect(generate(L('agō, agere', 'verb'))['pres.act.imp.2sg']).toBe('age');
    expect(L('dicō, dicāre', 'verb').irregular).toBeUndefined();
  });
});

describe('3rd conjugation -iō: capiō, capere', () => {
  const capiō = L('capiō, capere, cēpī, captum', 'verb');
  it('is v3io', () => expect(capiō.paradigm).toBe('v3io'));
  it('i before vowels except short-e (capere, cape); -iunt, -iam, -iēbam', () => {
    expect(generate(capiō)).toEqual(verbTable(
      ['capiō', 'capis', 'capit', 'capimus', 'capitis', 'capiunt'], 'capere', ['cape', 'capite'], {
        fut: ['capiam', 'capiēs', 'capiet', 'capiēmus', 'capiētis', 'capient'],
        impf: ['capiēbam', 'capiēbās', 'capiēbat', 'capiēbāmus', 'capiēbātis', 'capiēbant'],
      }));
  });
});

describe('4th conjugation: audiō, audīre', () => {
  const audiō = L('audiō, audīre, audīvī, audītum', 'verb');
  it('is v4 with stem audī-', () => expect(audiō.paradigm).toBe('v4'));
  it('long ī except before a vowel and final -t / nt: audit, audiunt, audiam, audiēbam', () => {
    expect(generate(audiō)).toEqual(verbTable(
      ['audiō', 'audīs', 'audit', 'audīmus', 'audītis', 'audiunt'], 'audīre', ['audī', 'audīte'], {
        fut: ['audiam', 'audiēs', 'audiet', 'audiēmus', 'audiētis', 'audient'],
        impf: ['audiēbam', 'audiēbās', 'audiēbat', 'audiēbāmus', 'audiēbātis', 'audiēbant'],
      }));
  });
  it('veniō, venīre (root vowel unaffected)', () => {
    const p = generate(L('veniō, venīre, vēnī, ventum', 'verb'));
    expect(pickCells(p, 'pres.act.ind')).toEqual(
      tenseTable('pres', ['veniō', 'venīs', 'venit', 'venīmus', 'venītis', 'veniunt']));
    expect(p['pres.act.imp.2sg']).toBe('venī');
  });
});

describe('Wheelock ch. 10: full present systems of faciō and veniō; conjugation from the principal parts', () => {
  it('faciō: 3rd -iō with the short imperative fac', () => {
    const l = L('faciō, facere, fēcī, factum', 'verb');
    expect(l.paradigm).toBe('v3io');
    expect(generate(l)).toEqual(verbTable(
      ['faciō', 'facis', 'facit', 'facimus', 'facitis', 'faciunt'], 'facere', ['fac', 'facite'], {
        fut: ['faciam', 'faciēs', 'faciet', 'faciēmus', 'faciētis', 'facient'],
        impf: ['faciēbam', 'faciēbās', 'faciēbat', 'faciēbāmus', 'faciēbātis', 'faciēbant'],
      }));
  });
  it('veniō: 4th conjugation, full table', () => {
    expect(generate(L('veniō, venīre, vēnī, ventum', 'verb'))).toEqual(verbTable(
      ['veniō', 'venīs', 'venit', 'venīmus', 'venītis', 'veniunt'], 'venīre', ['venī', 'venīte'], {
        fut: ['veniam', 'veniēs', 'veniet', 'veniēmus', 'veniētis', 'venient'],
        impf: ['veniēbam', 'veniēbās', 'veniēbat', 'veniēbāmus', 'veniēbātis', 'veniēbant'],
      }));
  });
  it('agō, agere → v3; capiō, capere → v3io; audiō, audīre → v4 (also compounds and fugiō, inveniō)', () => {
    const p = (hw: string) => L(hw, 'verb').paradigm;
    expect(p('agō, agere, ēgī, āctum')).toBe('v3');
    expect(p('vīvō, vīvere, vīxī, vīctum')).toBe('v3');
    expect(p('capiō, capere, cēpī, captum')).toBe('v3io');
    expect(p('fugiō, fugere, fūgī, fugitūrum')).toBe('v3io');
    expect(p('accipiō, accipere')).toBe('v3io');
    expect(p('audiō, audīre, audīvī, audītum')).toBe('v4');
    expect(p('inveniō, invenīre, invēnī, inventum')).toBe('v4');
    expect(p('dīcō, dīcere, dīxī, dictum')).toBe('v3');
  });
  it('other -iō verbs and -ficiō compounds of faciō have the regular -e imperative', () => {
    expect(generate(L('accipiō, accipere', 'verb'))['pres.act.imp.2sg']).toBe('accipe');
    expect(generate(L('cōnficiō, cōnficere', 'verb'))['pres.act.imp.2sg']).toBe('cōnfice');
    expect(generate(L('fugiō, fugere', 'verb'))['pres.act.imp.2sg']).toBe('fuge');
  });
});
