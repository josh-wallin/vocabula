import { describe, expect, it } from 'vitest';
import { generate } from '../src/morph/generate.ts';
import { L, verbTable } from './helpers.ts';

describe('1st conjugation: laudō, laudāre', () => {
  it('present active indicative, infinitive, imperatives', () => {
    expect(generate(L('laudō, laudāre, laudāvī, laudātum', 'verb'))).toEqual(verbTable(
      ['laudō', 'laudās', 'laudat', 'laudāmus', 'laudātis', 'laudant'], 'laudāre', ['laudā', 'laudāte']));
  });
});

describe('2nd conjugation: moneō, monēre', () => {
  it('present active indicative, infinitive, imperatives', () => {
    expect(generate(L('moneō, monēre, monuī, monitum', 'verb'))).toEqual(verbTable(
      ['moneō', 'monēs', 'monet', 'monēmus', 'monētis', 'monent'], 'monēre', ['monē', 'monēte']));
  });
  it('videō (stem vowel in root unaffected)', () => {
    expect(generate(L('videō, vidēre, vīdī, vīsum', 'verb'))).toEqual(verbTable(
      ['videō', 'vidēs', 'videt', 'vidēmus', 'vidētis', 'vident'], 'vidēre', ['vidē', 'vidēte']));
  });
});

describe('dō, dare: irregular vowel length via overrides', () => {
  const dō = L('dō, dare, dedī, datum', 'verb');
  it('carries overrides from inference', () => {
    expect(dō.irregular).toEqual({ 'pres.act.ind.2sg': 'dās', 'pres.act.imp.2sg': 'dā' });
  });
  it('dās and dā long; damus, datis, dant, dat, dare, date short', () => {
    expect(generate(dō)).toEqual(verbTable(
      ['dō', 'dās', 'dat', 'damus', 'datis', 'dant'], 'dare', ['dā', 'date']));
  });
  it('without overrides the rules alone would give short das/da (proves overrides matter)', () => {
    const { irregular: _ignored, ...plain } = dō;
    const p = generate(plain);
    expect(p['pres.act.ind.2sg']).toBe('das');
    expect(p['pres.act.imp.2sg']).toBe('da');
  });
});

describe('sum, esse', () => {
  it('present indicative and infinitive', () => {
    expect(generate(L('sum, esse, fuī, futūrum', 'verb'))).toEqual({
      'pres.act.ind.1sg': 'sum',
      'pres.act.ind.2sg': 'es',
      'pres.act.ind.3sg': 'est',
      'pres.act.ind.1pl': 'sumus',
      'pres.act.ind.2pl': 'estis',
      'pres.act.ind.3pl': 'sunt',
      'pres.act.inf': 'esse',
    });
  });
});
