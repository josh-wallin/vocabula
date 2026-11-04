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
  ['possum, posse, potuī', 'verb', 'irr:possum', null],
  ['agō, agere, ēgī, āctum', 'verb', 'v3', 'ag'],
  ['dūcō, dūcere, dūxī, ductum', 'verb', 'v3', 'dūc'],
  ['scrībō, scrībere, scrīpsī, scrīptum', 'verb', 'v3', 'scrīb'],
  ['capiō, capere, cēpī, captum', 'verb', 'v3io', 'cap'],
  ['fugiō, fugere, fūgī, fugitūrum', 'verb', 'v3io', 'fug'],
  ['audiō, audīre, audīvī, audītum', 'verb', 'v4', 'audī'],
  ['rēx, rēgis, m.', 'noun', 'n3', 'rēg', { gender: 'm' }],
  ['virtūs, virtūtis, f.', 'noun', 'n3', 'virtūt', { gender: 'f' }],
  ['homō, hominis, m.', 'noun', 'n3', 'homin'],
  ['amor, amōris, m.', 'noun', 'n3', 'amōr'],
  ['Carthāgō, Carthāginis, f.', 'noun', 'n3', 'Carthāgin'],
  ['corpus, corporis, n.', 'noun', 'n3n', 'corpor', { gender: 'n' }],
  ['tempus, temporis, n.', 'noun', 'n3n', 'tempor'],
  ['nōmen, nōminis, n.', 'noun', 'n3n', 'nōmin'],
  ['hostis, hostis, m.', 'noun', 'n3i', 'host'],
  ['mare, maris, n.', 'noun', 'n3in', 'mar'],
  ['arma, armōrum, n.', 'noun', 'n2n', 'arm', { number: 'pl' }],
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
    ['manus, manūs, f.', 'noun', /4th declension/],
    ['rēs, reī, f.', 'noun', /5th declension/],
    ['eō, īre, iī, itum', 'verb', /4th conjugation, but 1sg/],
    ['lūmen, luminis, n.', 'noun', /vowel length differs/],
    ['tempestas, tempestātis, f.', 'noun', /should be tempestās/],
    ['cōnsuētūdo, cōnsuētūdinis, f.', 'noun', /should end in -ō/],
    ['vīs, f.', 'noun', /no genitive/],
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
  it('a 3rd-decl. nominative that shares no stem with the genitive is low confidence (Iuppiter, Iovis)', () => {
    expect(inferParadigm('Iuppiter, Iovis, m.', 'noun')).toMatchObject({ paradigm: 'n3', confidence: 'low' });
  });
  it('a 3rd-decl. noun without gender is low confidence, with a guess', () => {
    expect(inferParadigm('corpus, corporis', 'noun')).toMatchObject({ paradigm: 'n3n', confidence: 'low', reason: expect.stringMatching(/guessed neuter/) });
    expect(inferParadigm('rēx, rēgis', 'noun')).toMatchObject({ paradigm: 'n3', confidence: 'low', reason: expect.stringMatching(/guessed m\.\/f\./) });
  });
  it('3rd-conj. 1sg and infinitive with different stems is low confidence', () => {
    expect(inferParadigm('agō, regere', 'verb')).toMatchObject({ paradigm: 'v3', confidence: 'low' });
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
  it('recognizes common gender (m./f.)', () => {
    expect(parseHeadword('cīvis, cīvis, m./f.')).toEqual({ parts: ['cīvis', 'cīvis'], indeclinable: false, common: true });
    expect(parseHeadword('volucris, volucris, f./m.').common).toBe(true);
  });
  it('splits paired entries', () => {
    expect(splitPairedHeadword('amīcus, amīcī, m., and amīca, amīcae, f.')).toEqual(['amīcus, amīcī, m.', 'amīca, amīcae, f.']);
  });
});

describe('lemma ids and notes', () => {
  it('enclitics get -enclitic ids (no collision with nē)', async () => {
    const { lemmaFromHeadword } = await import('../src/morph/lemma.ts');
    expect(lemmaFromHeadword('-ne', 'adv', '', []).lemma!.id).toBe('ne-enclitic');
    expect(lemmaFromHeadword('-que', 'conj', '', []).lemma!.id).toBe('que-enclitic');
    expect(lemmaFromHeadword('nē', 'adv', '', []).lemma!.id).toBe('ne-indecl');
  });
  it('audeō: regular 2nd-conj. present system, semi-deponent perfect noted', async () => {
    const { lemmaFromHeadword } = await import('../src/morph/lemma.ts');
    const l = lemmaFromHeadword('audeō, audēre, ausus sum', 'verb', '', []).lemma!;
    expect(l.paradigm).toBe('v2');
    expect(l.irregular).toBeUndefined();
    expect(l.notes).toMatch(/ausus sum/);
  });
  it('a pronoun (tē) is left unclassified without throwing', () => {
    expect(inferParadigm('tē', 'pron')).toMatchObject({ paradigm: null, confidence: 'none' });
  });
});
