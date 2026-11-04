/**
 * Wheelock ch. 9: demonstratives (hic, ille, iste) and the -īus adjectives,
 * checked against the standard tables (A&G §§113, 146; Wheelock ch. 9).
 */
import { describe, expect, it } from 'vitest';
import { generate } from '../src/morph/generate.ts';
import { analyze } from '../src/morph/analyze.ts';
import { citationMismatches } from '../src/morph/citation.ts';
import { inferParadigm } from '../src/morph/infer.ts';
import { classNote, citation } from '../src/engine/lexicon.ts';
import { L } from './helpers.ts';

const C5 = ['nom', 'gen', 'dat', 'acc', 'abl'];
/** Five forms (nom.–abl.) per gender and number → cell → form. */
function table(sg: Record<'m' | 'f' | 'n', string[]>, pl: Record<'m' | 'f' | 'n', string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [num, rows] of [['sg', sg], ['pl', pl]] as const) {
    for (const g of ['m', 'f', 'n'] as const) C5.forEach((c, i) => { out[`${c}.${num}.${g}`] = rows[g][i]!; });
  }
  return out;
}
const PL = (b: string) => ({
  m: [`${b}ī`, `${b}ōrum`, `${b}īs`, `${b}ōs`, `${b}īs`],
  f: [`${b}ae`, `${b}ārum`, `${b}īs`, `${b}ās`, `${b}īs`],
  n: [`${b}a`, `${b}ōrum`, `${b}īs`, `${b}a`, `${b}īs`],
});

describe('hic, haec, hoc', () => {
  const hic = L('hic, haec, hoc', 'pron');
  it('is pron:hic, citation consistent', () => {
    expect(hic.paradigm).toBe('pron:hic');
    expect(hic.id).toBe('hic-pron-hic');
    expect(citationMismatches(hic)).toEqual([]);
    expect(citation(hic)).toBe('hic, haec, hoc');
    expect(classNote(hic)).toBe('demonstrative');
  });
  it('full paradigm', () => {
    expect(generate(hic)).toEqual(table(
      { m: ['hic', 'huius', 'huic', 'hunc', 'hōc'], f: ['haec', 'huius', 'huic', 'hanc', 'hāc'], n: ['hoc', 'huius', 'huic', 'hoc', 'hōc'] },
      { m: ['hī', 'hōrum', 'hīs', 'hōs', 'hīs'], f: ['hae', 'hārum', 'hīs', 'hās', 'hīs'], n: ['haec', 'hōrum', 'hīs', 'haec', 'hīs'] }));
  });
  it('has no vocative', () => {
    expect(Object.keys(generate(hic)).some((c) => c.startsWith('voc.'))).toBe(false);
  });
});

describe('ille, illa, illud and iste, ista, istud', () => {
  const ille = L('ille, illa, illud', 'pron');
  const iste = L('iste, ista, istud', 'pron');
  it('both are pron:ille', () => {
    expect([ille.paradigm, iste.paradigm]).toEqual(['pron:ille', 'pron:ille']);
    expect([ille.id, iste.id]).toEqual(['ille-pron-ille', 'iste-pron-ille']);
    expect(citationMismatches(ille)).toEqual([]);
    expect(citationMismatches(iste)).toEqual([]);
  });
  for (const [l, b] of [[ille, 'ill'], [iste, 'ist']] as const) {
    it(`${l.parts[0]}: full paradigm`, () => {
      expect(generate(l)).toEqual(table(
        { m: [`${b}e`, `${b}īus`, `${b}ī`, `${b}um`, `${b}ō`], f: [`${b}a`, `${b}īus`, `${b}ī`, `${b}am`, `${b}ā`], n: [`${b}ud`, `${b}īus`, `${b}ī`, `${b}ud`, `${b}ō`] },
        PL(b)));
    });
  }
  it('classifies whether the list calls it a pronoun or an adjective', () => {
    expect(inferParadigm('ille, illa, illud', 'adj').paradigm).toBe('pron:ille');
    expect(inferParadigm('hic, haec, hoc', 'adj').paradigm).toBe('pron:hic');
  });
  it('other pronouns are still refused (ipse, is, ego)', () => {
    for (const hw of ['ipse, ipsa, ipsum', 'is, ea, id', 'ego, meī']) expect(inferParadigm(hw, 'pron').paradigm, hw).toBeNull();
  });
});

describe('-īus adjectives (UNUS NAUTA)', () => {
  it('all nine classify as adj:ius from their dictionary headwords; ordinary adjectives do not', () => {
    const hws = ['ūllus, ūlla, ūllum', 'nūllus, nūlla, nūllum', 'ūnus, ūna, ūnum', 'tōtus, tōta, tōtum', 'sōlus, sōla, sōlum',
      'neuter, neutra, neutrum', 'alius, alia, aliud', 'alter, altera, alterum', 'uter, utra, utrum'];
    for (const hw of hws) {
      const inf = inferParadigm(hw, 'adj');
      expect([hw, inf.paradigm, inf.confidence]).toEqual([hw, 'adj:ius', 'high']);
      expect(citationMismatches(L(hw, 'adj')), hw).toEqual([]);
    }
    expect(inferParadigm('bonus, bona, bonum', 'adj').paradigm).toBe('adj12');
    expect(inferParadigm('magnus, magna, magnum', 'adj').paradigm).toBe('adj12');
  });
  it('abbreviated headwords expand: "sōlus, -a, -um"; ūnus may be listed as a numeral', () => {
    const s = L('sōlus, -a, -um', 'adj');
    expect([s.paradigm, s.parts]).toEqual(['adj:ius', ['sōlus', 'sōla', 'sōlum']]);
    expect(L('alius, -a, -ud', 'adj').parts).toEqual(['alius', 'alia', 'aliud']);
    expect(L('ūnus, ūna, ūnum', 'num').paradigm).toBe('adj:ius');
    expect(inferParadigm('duo, duae, duo', 'num').paradigm).toBeNull();
  });
  it('ūnus: full paradigm', () => {
    expect(generate(L('ūnus, ūna, ūnum', 'adj'))).toEqual(table(
      { m: ['ūnus', 'ūnīus', 'ūnī', 'ūnum', 'ūnō'], f: ['ūna', 'ūnīus', 'ūnī', 'ūnam', 'ūnā'], n: ['ūnum', 'ūnīus', 'ūnī', 'ūnum', 'ūnō'] },
      PL('ūn')));
  });
  it('sōlus: full paradigm, with a lemma note', () => {
    const l = L('sōlus, sōla, sōlum', 'adj');
    expect(generate(l)).toEqual(table(
      { m: ['sōlus', 'sōlīus', 'sōlī', 'sōlum', 'sōlō'], f: ['sōla', 'sōlīus', 'sōlī', 'sōlam', 'sōlā'], n: ['sōlum', 'sōlīus', 'sōlī', 'sōlum', 'sōlō'] },
      PL('sōl')));
    expect(l.notes).toBe('Gen. sg. sōlīus, dat. sg. sōlī');
  });
  it('alter keeps its e; alterīus as Wheelock prints it (note mentions alterius)', () => {
    const l = L('alter, altera, alterum', 'adj');
    expect(generate(l)).toEqual(table(
      { m: ['alter', 'alterīus', 'alterī', 'alterum', 'alterō'], f: ['altera', 'alterīus', 'alterī', 'alteram', 'alterā'], n: ['alterum', 'alterīus', 'alterī', 'alterum', 'alterō'] },
      PL('alter')));
    expect(l.notes).toMatch(/alterius/);
  });
  it('neuter and uter drop their e', () => {
    const n = generate(L('neuter, neutra, neutrum', 'adj'));
    expect([n['nom.sg.m'], n['gen.sg.f'], n['dat.sg.n'], n['acc.sg.m'], n['nom.pl.m']]).toEqual(['neuter', 'neutrīus', 'neutrī', 'neutrum', 'neutrī']);
    const u = generate(L('uter, utra, utrum', 'adj'));
    expect([u['nom.sg.m'], u['gen.sg.m'], u['dat.sg.f'], u['abl.sg.f']]).toEqual(['uter', 'utrīus', 'utrī', 'utrā']);
  });
  it('alius: neuter aliud, dat. aliī; gen. sg. alterīus as Wheelock prints it (alīus is rare)', () => {
    const l = L('alius, alia, aliud', 'adj');
    expect(generate(l)).toEqual(table(
      { m: ['alius', 'alterīus', 'aliī', 'alium', 'aliō'], f: ['alia', 'alterīus', 'aliī', 'aliam', 'aliā'], n: ['aliud', 'alterīus', 'aliī', 'aliud', 'aliō'] },
      PL('ali')));
    expect(l.notes).toMatch(/alīus is rare/);
  });
  it('no vocative cells', () => {
    expect(Object.keys(generate(L('tōtus, tōta, tōtum', 'adj'))).some((c) => c.startsWith('voc.'))).toBe(false);
  });
});

describe('analyze(): ambiguous demonstrative forms', () => {
  const lemmas = [L('hic, haec, hoc', 'pron'), L('ille, illa, illud', 'pron'), L('ūnus, ūna, ūnum', 'adj'), L('alius, alia, aliud', 'adj')];
  const an = (f: string) => analyze(f, lemmas).map((a) => `${a.lemma.parts[0]}:${a.cell}`).sort();
  it('huic: dative singular in all genders', () => {
    expect(an('huic')).toEqual(['hic:dat.sg.f', 'hic:dat.sg.m', 'hic:dat.sg.n']);
  });
  it('illī: dative singular (any gender) or masculine nominative plural, never genitive', () => {
    expect(an('illī')).toEqual(['ille:dat.sg.f', 'ille:dat.sg.m', 'ille:dat.sg.n', 'ille:nom.pl.m']);
    expect(an('illīus')).toEqual(['ille:gen.sg.f', 'ille:gen.sg.m', 'ille:gen.sg.n']);
  });
  it('hōc / hāc are ablative; hoc is neuter nom./acc.', () => {
    expect(an('hōc')).toEqual(['hic:abl.sg.m', 'hic:abl.sg.n']);
    expect(an('hāc')).toEqual(['hic:abl.sg.f']);
    expect(an('hoc')).toEqual(['hic:acc.sg.n', 'hic:nom.sg.n']);
  });
  it('haec: feminine nominative singular, or neuter nominative/accusative plural', () => {
    expect(an('haec')).toEqual(['hic:acc.pl.n', 'hic:nom.pl.n', 'hic:nom.sg.f']);
  });
  it('without macrons, hoc also matches the ablative hōc', () => {
    const loose = analyze('hoc', lemmas, { ignoreMacrons: true }).map((a) => a.cell).sort();
    expect(loose).toEqual(['abl.sg.m', 'abl.sg.n', 'acc.sg.n', 'nom.sg.n']);
  });
  it('alterīus: genitive singular of alter and (borrowed) of alius', () => {
    const both = [...lemmas, L('alter, altera, alterum', 'adj')];
    const g = analyze('alterīus', both).map((a) => `${a.lemma.parts[0]}:${a.cell}`).sort();
    expect(g).toEqual(['alius:gen.sg.f', 'alius:gen.sg.m', 'alius:gen.sg.n', 'alter:gen.sg.f', 'alter:gen.sg.m', 'alter:gen.sg.n']);
  });
  it('ūnī: dative singular or masculine nominative plural; aliī likewise', () => {
    expect(an('ūnī')).toEqual(['ūnus:dat.sg.f', 'ūnus:dat.sg.m', 'ūnus:dat.sg.n', 'ūnus:nom.pl.m']);
    expect(an('aliī')).toEqual(['alius:dat.sg.f', 'alius:dat.sg.m', 'alius:dat.sg.n', 'alius:nom.pl.m']);
  });
});
