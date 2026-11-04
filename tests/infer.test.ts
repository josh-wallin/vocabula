import { describe, expect, it } from 'vitest';
import { inferParadigm, parseHeadword, splitPairedHeadword } from '../src/morph/infer.ts';
import type { PartOfSpeech } from '../src/morph/types.ts';

type Case = [headword: string, pos: PartOfSpeech, paradigm: string, stem: string | null, extra?: Record<string, unknown>];

const CASES: Case[] = [
  ['porta, portae, f.', 'noun', 'n1', 'port', { gender: 'f' }],
  ['nauta, nautae, m.', 'noun', 'n1', 'naut', { gender: 'm' }],
  ['philosophia, philosophiae, f.', 'noun', 'n1', 'philosophi'],
  ['ager, agrī, m.', 'noun', 'n2m', 'agr', { gender: 'm' }],
  ['puer, puerī, m.', 'noun', 'n2m', 'puer'],
  ['magister, magistrī, m.', 'noun', 'n2m', 'magistr'],
  ['vir, virī, m.', 'noun', 'n2m', 'vir'],
  ['amīcus, amīcī, m.', 'noun', 'n2m', 'amīc'],
  ['fīlius, fīliī, m.', 'noun', 'n2m', 'fīli'],
  ['populus, populī, m.', 'noun', 'n2m', 'popul'],
  ['deus, deī, m.', 'noun', 'n2m', 'de'],
  ['dōnum, dōnī, n.', 'noun', 'n2n', 'dōn', { gender: 'n' }],
  ['cōnsilium, cōnsiliī, n.', 'noun', 'n2n', 'cōnsili'],
  ['laudō, laudāre, laudāvī, laudātum', 'verb', 'v1', 'laudā'],
  ['satiō, satiāre, satiāvī, satiātum', 'verb', 'v1', 'satiā'],
  ['iuvō (or adiuvō), iuvāre, iūvī, iūtum', 'verb', 'v1', 'iuvā'],
  ['moneō, monēre, monuī, monitum', 'verb', 'v2', 'monē'],
  ['salveō, salvēre', 'verb', 'v2', 'salvē'],
  ['valeō, valēre, valuī, valitūrum', 'verb', 'v2', 'valē'],
  ['magnus, magna, magnum', 'adj', 'adj12', 'magn'],
  ['līber, lībera, līberum', 'adj', 'adj12', 'līber'],
  ['pulcher, pulchra, pulchrum', 'adj', 'adj12', 'pulchr'],
  ['paucī, paucae, pauca', 'adj', 'adj12', 'pauc', { number: 'pl' }],
  ['sum, esse, fuī, futūrum', 'verb', 'irr:sum', null],
  ['nihil, indeclinable, n.', 'noun', 'indecl', null],
  ['saepe', 'adv', 'indecl', null],
];

describe('inferParadigm: classified headwords', () => {
  it.each(CASES)('%s → %s', (hw, pos, paradigm, stem, extra) => {
    const r = inferParadigm(hw, pos);
    expect(r.paradigm).toBe(paradigm);
    expect(r.stem).toBe(stem);
    expect(r.confidence).toBe('high');
    if (extra) expect(r).toMatchObject(extra);
  });
  it('dō, dare: v1 with known overrides', () => {
    const r = inferParadigm('dō, dare, dedī, datum', 'verb');
    expect(r).toMatchObject({ paradigm: 'v1', stem: 'da', confidence: 'high' });
    expect(r.irregular).toEqual({ 'pres.act.ind.2sg': 'dās', 'pres.act.imp.2sg': 'dā' });
  });
});

describe('inferParadigm: refusals and doubts carry a reason', () => {
  it.each<[string, PartOfSpeech, RegExp]>([
    ['rēx, rēgis, m.', 'noun', /3rd declension/],
    ['manus, manūs, f.', 'noun', /4th declension/],
    ['rēs, reī, f.', 'noun', /5th declension/],
    ['dūcō, dūcere, dūxī, ductum', 'verb', /3rd conjugation/],
    ['audiō, audīre, audīvī, audītum', 'verb', /4th conjugation/],
    ['est', 'verb', /no infinitive/],
    ['fortis, forte', 'adj', /three nominative forms/],
    ['ācer, ācris, ācre', 'adj', /not a 1st\/2nd/],
    ['mē', 'pron', /not implemented/],
  ])('%s', (hw, pos, re) => {
    const r = inferParadigm(hw, pos);
    expect(r.paradigm).toBeNull();
    expect(r.confidence).toBe('none');
    expect(r.reason).toMatch(re);
  });
  it('a short-a 1st-conj. verb that is not a known irregular is low confidence', () => {
    const r = inferParadigm('stō, stare', 'verb');
    expect(r.paradigm).toBe('v1');
    expect(r.confidence).toBe('low');
    expect(r.reason).toMatch(/irregular/);
  });
  it('mismatched nominative/genitive is low confidence', () => {
    const r = inferParadigm('ager, campī, m.', 'noun');
    expect(r.confidence).toBe('low');
    expect(r.reason).toBeTruthy();
  });
  it('missing gender on a 1st-decl. noun is low confidence', () => {
    expect(inferParadigm('porta, portae', 'noun')).toMatchObject({ paradigm: 'n1', confidence: 'low', reason: 'gender not given' });
  });
});

describe('headword parsing', () => {
  it('drops gender tags and parentheticals', () => {
    expect(parseHeadword('iuvō (or adiuvō), iuvāre, iūvī, iūtum').parts).toEqual(['iuvō', 'iuvāre', 'iūvī', 'iūtum']);
    expect(parseHeadword('ager, agrī, m.')).toEqual({ parts: ['ager', 'agrī'], gender: 'm', indeclinable: false });
  });
  it('splits paired entries', () => {
    expect(splitPairedHeadword('amīcus, amīcī, m., and amīca, amīcae, f.')).toEqual(['amīcus, amīcī, m.', 'amīca, amīcae, f.']);
  });
});
