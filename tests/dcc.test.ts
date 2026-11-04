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
    // 3rd declension: the genitive tail replaces the nominative ending
    ['rēx rēgis m.', 'Noun: 3rd Declension', 'rēx, rēgis, m.'],
    ['tempus -oris n.', 'Noun: 3rd Declension', 'tempus, temporis, n.'],
    ['nōmen -inis n.', 'Noun: 3rd Declension', 'nōmen, nōminis, n.'],
    ['virtūs -ūtis f.', 'Noun: 3rd Declension', 'virtūs, virtūtis, f.'],
    ['amor -ōris m.', 'Noun: 3rd Declension', 'amor, amōris, m.'],
    ['ratiō -ōnis f.', 'Noun: 3rd Declension', 'ratiō, ratiōnis, f.'],
    ['condīciō -ōnis f.', 'Noun: 3rd Declension', 'condīciō, condīciōnis, f.'],
    ['cupīdō -inis f.', 'Noun: 3rd Declension', 'cupīdō, cupīdinis, f.'],
    ['māgnitūdō -inis f.', 'Noun: 3rd Declension', 'māgnitūdō, māgnitūdinis, f.'],
    ['aetās -tātis f.', 'Noun: 3rd Declension', 'aetās, aetātis, f.'],
    ['mīles -itis m.', 'Noun: 3rd Declension', 'mīles, mīlitis, m.'],
    ['āgmen -minis n.', 'Noun: 3rd Declension', 'āgmen, āgminis, n.'],
    ['sacerdōs -dōtis m./f.', 'Noun: 3rd Declension', 'sacerdōs, sacerdōtis, m./f.'],
    ['hostis -is m./f.', 'Noun: 3rd Declension', 'hostis, hostis, m./f.'],
    ['sēdēs -is f.', 'Noun: 3rd Declension', 'sēdēs, sēdis, f.'],
    ['mare -is n.', 'Noun: 3rd Declension', 'mare, maris, n.'],
    ['moenia -ium n. pl.', 'Noun: 3rd Declension', 'moenia, moenium, n.'],
    // corrections table
    ['senex -is m.', 'Noun: 3rd Declension', 'senex, senis, m.'],
    ['tempestas -tātis f.', 'Noun: 3rd Declension', 'tempestās, tempestātis, f.'],
    ['parēns -ntis m./f.', 'Noun: 3rd Declension', 'parēns, parentis, m./f.'],
    // 3rd / 4th conjugation infinitive tails
    ['dūcō dūcere dūxī ductum', 'Verb: 3rd Conjugation -ō', 'dūcō, dūcere, dūxī, ductum'],
    ['quaerō -rere -sīvī -sītum', 'Verb: 3rd Conjugation -ō', 'quaerō, quaerere'],
    ['reddō -dere -didī -ditum', 'Verb: 3rd Conjugation -ō', 'reddō, reddere'],
    ['addō -dere -didī -ditum', 'Verb: 3rd Conjugation -ō', 'addō, addere'],
    ['relinquō -linquere -līquī -lictum', 'Verb: 3rd Conjugation -ō', 'relinquō, relinquere'],
    ['dēserō -ere dēseruī dēsertum', 'Verb: 3rd Conjugation -ō', 'dēserō, dēserere, dēseruī, dēsertum'],
    ['accipiō -cipere -cēpī -ceptum', 'Verb: 3rd Conjugation -iō', 'accipiō, accipere'],
    ['cupiō -ere -īvī -ītum', 'Verb: 3rd Conjugation -iō', 'cupiō, cupere'],
    ['audiō -īre -īvī/-iī -ītum', 'Verb: 4th Conjugation', 'audiō, audīre'],
    ['inveniō -venīre -vēnī -ventum', 'Verb: 4th Conjugation', 'inveniō, invenīre'],
    ['reperiō -perīre -pperī -pertum', 'Verb: 4th Conjugation', 'reperiō, reperīre'],
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
    { rank: 4, headword: 'agō agere ēgī āctum', definition: 'drive', pos: 'Verb: 3rd Conjugation -ō', semantic_group: 'x' },
    { rank: 5, headword: 'possum posse potuī', definition: 'be able', pos: 'Verb: Irregular', semantic_group: 'x' },
    { rank: 6, headword: 'ferō ferre tulī lātum', definition: 'carry', pos: 'Verb: Irregular', semantic_group: 'x' },
    { rank: 7, headword: 'manus -ūs f.', definition: 'hand', pos: 'Noun: 4th Declension', semantic_group: 'x' },
  ];
  const r = importDcc(entries);
  it('splits paired entries into both declensions; imports 3rd decl., 3rd conj., possum', () => {
    expect(r.lemmas.map((l) => l.paradigm).sort()).toEqual(['irr:possum', 'n1', 'n2m', 'n3', 'v1', 'v3']);
  });
  it('generates forms for imported words', () => {
    const creo = r.lemmas.find((l) => l.parts[0] === 'creō')!;
    expect(form(creo, 'pres.act.ind.3pl')).toBe('creant');
    expect(form(r.lemmas.find((l) => l.parts[0] === 'rēx')!, 'dat.pl')).toBe('rēgibus');
    expect(form(r.lemmas.find((l) => l.parts[0] === 'agō')!, 'fut.act.ind.1sg')).toBe('agam');
  });
  it('skips paradigms not implemented yet; unimplemented irregular verbs are skipped, not problems', () => {
    expect(r.skipped.map((s) => s.entry.rank).sort()).toEqual([6, 7]);
    expect(r.problems).toEqual([]);
  });
});

const real = 'content/source/dcc-core-latin.json';
describe.skipIf(!existsSync(real))('full DCC list', () => {
  const r = importDcc(JSON.parse(readFileSync(real, 'utf8')));
  it('imports the implemented categories with only known exceptions', () => {
    expect(r.lemmas.length).toBeGreaterThanOrEqual(670);
    const by = (p: string) => r.lemmas.filter((l) => l.paradigm === p).length;
    expect(by('n3') + by('n3n') + by('n3i') + by('n3in')).toBeGreaterThanOrEqual(155);
    expect(by('v3')).toBeGreaterThanOrEqual(114);
    expect(by('v3io')).toBe(21);
    expect(by('v4')).toBe(13);
    // Known: plērusque (compound adjective), vōs (mislabelled pronoun),
    // vulgus (n. and m.), humus (fem. 2nd decl.), vīs (irregular, no genitive printed).
    expect(r.problems.length).toBeLessThanOrEqual(6);
  });
  it('demonstratives and -īus adjectives (Wheelock ch. 9) import with their own paradigms; other pronouns are skipped', () => {
    const by = (p: string) => r.lemmas.filter((l) => l.paradigm === p).map((l) => l.parts[0]).sort();
    expect(by('pron:hic')).toEqual(['hic']);
    expect(by('pron:ille')).toEqual(['ille', 'iste']);
    expect(by('adj:ius')).toEqual(['alius', 'alter', 'nūllus', 'sōlus', 'tōtus', 'ūllus', 'ūnus']);
    expect(r.lemmas.find((l) => l.parts[0] === 'nūllus')!.paradigm).toBe('adj:ius');
    expect(form(r.lemmas.find((l) => l.parts[0] === 'nūllus')!, 'gen.sg.m')).toBe('nūllīus');
    expect(r.lemmas.find((l) => l.parts[0] === 'alius')!.parts).toEqual(['alius', 'alia', 'aliud']);
    for (const hw of ['is ea id', 'ipse ipsa ipsum', 'īdem eadem idem']) {
      expect(r.skipped.some((s) => s.entry.headword === hw), hw).toBe(true);
    }
    expect(r.problems.some((p) => p.entry.headword.startsWith('alius'))).toBe(false);
    expect(r.problems.length).toBeLessThanOrEqual(5);
  });
  it('3rd-decl. i-stems and their A&G exceptions', () => {
    const p = (nom: string) => r.lemmas.find((l) => l.parts[0] === nom)?.paradigm;
    expect(['pars', 'urbs', 'nox', 'mōns', 'hostis', 'cīvis', 'ignis', 'nāvis'].map(p)).toEqual(Array(8).fill('n3i'));
    expect(['mare', 'animal'].map(p)).toEqual(['n3in', 'n3in']);
    expect(['canis', 'iuvenis', 'senex', 'pater', 'parēns', 'vātēs', 'sēdēs', 'volucris'].map(p)).toEqual(Array(8).fill('n3'));
  });
});
