import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pseudoWord, segment, showStress, stressIndex, syllabify, toPseudo } from '../src/compare/pseudo.ts';
import { COMPARE_ITEMS } from '../src/compare/items.ts';
import { espeakKey, espeakKeyInput, espeakUrl } from '../src/compare/espeakUrl.ts';
import { COLUMNS, summarize, type TtsRating } from '../src/compare/protocol.ts';
import { latinText, parseSentences } from '../src/engine/sentences.ts';

describe('pseudo-orthography', () => {
  const cases: [string, string][] = [
    // c → k everywhere
    ['Cicerō', 'KÌkeroo'], ['Caesar', 'KÀIsar'], ['centum', 'KÈNtum'],
    // consonantal v → w
    ['vīnum', 'WÌInum'], ['virī', 'WÌrii'],
    // ae → ai, oe → oi
    ['caelum', 'KÀIlum'], ['poena', 'PÒIna'],
    // qu → kw; ngu + vowel → ngw
    ['aqua', 'Àkwa'], ['quis', 'kwis'], ['lingua', 'LÌNgwa'],
    // g hard: gh before front vowels (Ciletti), gn closes the syllable
    ['genus', 'GHÈnus'], ['magnus', 'MÀGnus'],
    // long vowels doubled
    ['mālum', 'MÀAlum'], ['malum', 'MÀlum'], ['līber', 'LÌIber'], ['liber', 'LÌber'],
    ['populus', 'PÒpulus'], ['pōpulus', 'PÒOpulus'],
    // consonantal i → y; geminate yy between vowels
    ['iam', 'yam'], ['Iūlius', 'YÙUlius'], ['cuius', 'KÙYyus'], ['huius', 'HÙYyus'], ['iuvant', 'YÙwant'],
    // h kept; ph/th → p/t
    ['mihi', 'MÌhi'], ['philosophia', 'piloSÒpia'], ['theātrum', 'teÀAtrum'],
    // double consonants kept
    ['anus', 'Ànus'], ['annus', 'ÀNnus'],
    // x = ks
    ['exercitus', 'ekSÈRkitus'],
  ];
  for (const [la, want] of cases) it(`${la} → ${want}`, () => expect(pseudoWord(la)).toBe(want));

  it('keeps punctuation and spacing; lower-cases unstressed syllables', () => {
    expect(toPseudo('Arma virumque canō, Trōiae quī prīmus ab ōrīs'))
      .toBe('ÀRma wiRÙMkwe KÀnoo, TRÒOYyai kwii PRÌImus ab ÒOriis');
    expect(toPseudo('Gallia est omnis dīvīsa in partēs trēs.')).toBe('GÀLlia est ÒMnis diiWÌIsa in PÀRtees trees.');
  });

  it('handles decomposed macrons (NFD input)', () => {
    expect(pseudoWord('mālum')).toBe('MÀAlum');
  });

  it('consonantal i vs vowel i', () => {
    expect(segment('quia').map((s) => s.out)).toEqual(['kw', 'i', 'a']);
    expect(segment('diēs').map((s) => s.out)).toEqual(['d', 'i', 'ee', 's']);
    expect(segment('Trōia').map((s) => s.out)).toEqual(['t', 'r', 'oo', 'y', 'y', 'a']);
  });
});

describe('stress (penult law)', () => {
  const cases: [string, string][] = [
    ['amāre', 'a·MAA·re'], // long penult
    ['agricola', 'a·GRI·ko·la'], // short penult → antepenult; gr is muta cum liquida (onset)
    ['cēnābimus', 'kee·NAA·bi·mus'],
    ['puella', 'pu·EL·la'], // penult closed by position
    ['tenebrae', 'TE·ne·brai'], // muta cum liquida does not make position in prose
    ['fēmina', 'FEE·mi·na'],
    ['laudant', 'LAU·dant'], // two syllables → first
    ['virumque', 'wi·RUM·kwe'],
    ['Graecia', 'GRAI·ki·a'],
  ];
  for (const [la, want] of cases) it(`${la} → ${want}`, () => expect(showStress(la)).toBe(want));

  it('stressIndex', () => {
    const L = { heavy: false }, H = { heavy: true };
    expect(stressIndex([H])).toBe(0);
    expect(stressIndex([L, L])).toBe(0);
    expect(stressIndex([L, H, L])).toBe(1);
    expect(stressIndex([L, L, L])).toBe(0);
    expect(stressIndex([L, L, L, L])).toBe(1);
  });

  it('syllable weight: diphthong, long vowel, closed syllable', () => {
    // (a final syllable closed by a consonant counts as heavy; stress never looks at it)
    expect(syllabify(segment('caelum')).map((s) => s.heavy)).toEqual([true, true]);
    expect(syllabify(segment('poena')).map((s) => s.heavy)).toEqual([true, false]);
    expect(syllabify(segment('māla')).map((s) => s.heavy)).toEqual([true, false]);
    expect(syllabify(segment('mala')).map((s) => s.heavy)).toEqual([false, false]);
    expect(syllabify(segment('annus')).map((s) => s.heavy)).toEqual([true, true]);
    expect(syllabify(segment('malum')).map((s) => s.heavy)).toEqual([false, true]);
  });
});

describe('compare items', () => {
  it('about 20 items, unique ids, all respellable', () => {
    expect(COMPARE_ITEMS.length).toBeGreaterThanOrEqual(18);
    expect(new Set(COMPARE_ITEMS.map((i) => i.id)).size).toBe(COMPARE_ITEMS.length);
    for (const it of COMPARE_ITEMS) {
      expect(it.la.length).toBeLessThan(400);
      expect(toPseudo(it.la)).not.toMatch(/[cvqāēīōū]/);
    }
  });
  it('items marked `from` match the sentence bank verbatim', () => {
    const dir = resolve(import.meta.dirname, '../content/sentences');
    const bank = new Map(readdirSync(dir).flatMap((f) => parseSentences(JSON.parse(readFileSync(resolve(dir, f), 'utf8')))).map((s) => [s.id, s]));
    for (const it of COMPARE_ITEMS.filter((i) => i.from)) {
      const s = bank.get(it.from!);
      expect(s, it.from).toBeDefined();
      expect(latinText(s!)).toBe(it.la);
    }
  });
});

describe('eSpeak key adapter', () => {
  it('matches the audio branch test vector (Amō)', async () => {
    expect(espeakKeyInput(' Amō ')).toBe('espeak-ng+p1|la|130|amō');
    expect(await espeakKey('Amō')).toBe('fb92e07d84a2cd968a353adf');
    expect(await espeakKey('amō')).toBe(await espeakKey('AMŌ'));
    expect(await espeakUrl('Amō')).toBe('/api/audio/fb92e07d84a2cd968a353adf');
  });
});

describe('summary', () => {
  it('averages scores per column and ranks problems', () => {
    const r = (item: string, engine: string, variant: string, score: number | null, problems: TtsRating['problems']): TtsRating =>
      ({ item, engine, variant, score, problems, note: '' });
    const s = summarize([
      r('a', 'openai', 'pseudo', 4, ['length']),
      r('b', 'openai', 'pseudo', 5, ['length', 'stress']),
      r('c', 'openai', 'pseudo', null, ['stress', 'c']),
      r('a', 'gemini', 'plain', 2, ['c']),
    ]);
    expect(s.map((c) => c.id)).toEqual(COLUMNS.map((c) => c.id));
    const op = s.find((c) => c.id === 'openai:pseudo')!;
    expect(op).toMatchObject({ rated: 2, average: 4.5 });
    expect(op.problems).toEqual([['length', 2], ['stress', 2], ['c', 1]]);
    expect(s.find((c) => c.id === 'espeak')).toMatchObject({ rated: 0, average: null, problems: [] });
    expect(s.find((c) => c.id === 'gemini:plain')).toMatchObject({ rated: 1, average: 2 });
  });
});
