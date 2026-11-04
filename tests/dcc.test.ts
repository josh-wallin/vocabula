import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { expandHeadword, importDcc, type DccEntry } from '../src/data/dcc.ts';
import { form } from '../src/morph/generate.ts';

describe('DCC headword expansion', () => {
  const cases: [string, string, string][] = [
    ['terra -ae f.', 'Noun: 1st Declension', 'terra, terrae, f.'],
    ['tenebrae -brārum f. pl.', 'Noun: 1st Declension', 'tenebrae, tenebrārum, f.'],
    ['animus -ī m.', 'Noun: 2nd Declension', 'animus, animī, m.'],
    ['convīvium -iī n.', 'Noun: 2nd Declension', 'convīvium, convīviī, n.'],
    ['māgnus -a -um', 'Adjective: 1st and 2nd Declension', 'māgnus, māgna, māgnum'],
    ['integer -gra -grum:', 'Adjective: 1st and 2nd Declension', 'integer, integra, integrum'],
    ['vocō -āre', 'Verb: 1st Conjugation', 'vocō, vocāre'],
    ['creō -āre', 'Verb: 1st Conjugation', 'creō, creāre'],
    ['teneō -ēre -uī tentum', 'Verb: 2nd Conjugation', 'teneō, tenēre'],
    ['retineō -tinēre -tinuī -tentum', 'Verb: 2nd Conjugation', 'retineō, retinēre'],
    ['exerceō -ercēre -ercuī -ercitum', 'Verb: 2nd Conjugation', 'exerceō, exercēre'],
    ['praestō -stāre -stitī -stitum', 'Verb: 1st Conjugation', 'praestō, praestāre'],
    ['videō vidēre vīdī vīsum', 'Verb: 2nd Conjugation', 'videō, vidēre, vīdī, vīsum'],
  ];
  for (const [raw, label, want] of cases) {
    it(`${raw} → ${want}`, () => expect(expandHeadword(raw, label)?.headword).toBe(want));
  }
});

describe('DCC import', () => {
  const entries: DccEntry[] = [
    { rank: 1, headword: 'fīlia -ae f.; fīlius -ī m.', definition: 'daughter; son', pos: 'Noun: 1st Declension', semantic_group: 'Family' },
    { rank: 2, headword: 'creō -āre', definition: 'create', pos: 'Verb: 1st Conjugation', semantic_group: 'x' },
    { rank: 3, headword: 'rēx rēgis m.', definition: 'king', pos: 'Noun: 3rd Declension', semantic_group: 'x' },
  ];
  const r = importDcc(entries);
  it('splits paired entries into both declensions', () => {
    expect(r.lemmas.map((l) => l.paradigm).sort()).toEqual(['n1', 'n2m', 'v1']);
  });
  it('generates forms for imported words', () => {
    const creo = r.lemmas.find((l) => l.parts[0] === 'creō')!;
    expect(form(creo, 'pres.act.ind.3pl')).toBe('creant');
  });
  it('skips paradigms not implemented yet', () => expect(r.skipped).toHaveLength(1));
});

const real = 'content/source/dcc-core-latin.json';
describe.skipIf(!existsSync(real))('full DCC list', () => {
  const r = importDcc(JSON.parse(readFileSync(real, 'utf8')));
  it('imports the implemented categories with only known exceptions', () => {
    expect(r.lemmas.length).toBeGreaterThanOrEqual(360);
    // Known: alius, arma (plural-only neuter), vōs (mislabelled), īra (DCC prints gen. without macron),
    // vulgus (n. and m.), humus (fem. 2nd decl.), plērusque.
    expect(r.problems.length).toBeLessThanOrEqual(8);
  });
});
