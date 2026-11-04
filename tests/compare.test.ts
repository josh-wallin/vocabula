import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pseudoWord, segment, showStress, stressIndex, syllabify, toPseudo } from '../src/compare/pseudo.ts';
import { COMPARE_GROUPS, COMPARE_ITEMS, SPOT_ITEMS } from '../src/compare/items.ts';
import { dccLemmas } from '../src/content/dccList.ts';
import { citationText, wordText } from '../src/audio/items.ts';
import { historiaTexts, lectioTexts } from '../scripts/audio-manifest.ts';
import { tokenText } from '../src/engine/sentences.ts';
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
    for (const it of [...COMPARE_ITEMS, ...SPOT_ITEMS].filter((i) => i.from)) {
      const s = bank.get(it.from!);
      expect(s, it.from).toBeDefined();
      expect(latinText(s!)).toBe(it.la);
    }
  });
});

describe('Gemini spot-check items', () => {
  const dir = resolve(import.meta.dirname, '../content/sentences');
  const bank = readdirSync(dir).flatMap((f) => parseSentences(JSON.parse(readFileSync(resolve(dir, f), 'utf8'))));
  const dcc = dccLemmas();
  const hist = historiaTexts();
  const sources: Record<string, Set<string>> = {
    'dcc-word': new Set(dcc.map((l) => wordText(l))),
    'dcc-citation': new Set(dcc.map((l) => citationText(l)).filter((c): c is string => !!c)),
    'bank-form': new Set(bank.flatMap((s) => s.tokens.map((t) => tokenText(t)))),
    'historia-word': new Set(hist.filter((t) => !t.includes(' '))),
    historia: new Set(hist.filter((t) => t.includes(' '))),
    lectio: new Set(lectioTexts()),
    sentence: new Set(bank.map((s) => latinText(s))),
  };
  it('about 30, ids unique across both sections, existing 21 voice-test items untouched', () => {
    expect(SPOT_ITEMS.length).toBeGreaterThanOrEqual(28);
    expect(SPOT_ITEMS.length).toBeLessThanOrEqual(34);
    expect(COMPARE_ITEMS).toHaveLength(21);
    const ids = [...COMPARE_ITEMS, ...SPOT_ITEMS].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const it of SPOT_ITEMS) expect(it.id).toMatch(/^spot-[\w-]+$/);
  });
  it('each text is really in the source it names, exactly as the app speaks it', () => {
    for (const it of SPOT_ITEMS.filter((i) => i.src && i.src !== 'pack-word')) {
      expect(sources[it.src!]!.has(it.la), `${it.id}: ${it.la} in ${it.src}`).toBe(true);
    }
  });
  it('covers the shapes asked for', () => {
    const n = (src: string) => SPOT_ITEMS.filter((i) => i.src === src).length;
    expect(n('dcc-word') + n('bank-form') + n('pack-word')).toBeGreaterThanOrEqual(8);
    expect(n('historia-word')).toBeGreaterThanOrEqual(8);
    expect(n('sentence')).toBeGreaterThanOrEqual(6);
    expect(n('lectio') + n('historia')).toBeGreaterThanOrEqual(4);
    const words = SPOT_ITEMS.filter((i) => !i.la.includes(' ')).map((i) => i.la);
    expect(words.some((w) => /ph|th/.test(w))).toBe(true);
    expect(words.some((w) => /gn/.test(w))).toBe(true);
    expect(words.some((w) => /^i[aeiouāēīōū]/.test(w))).toBe(true);
    expect(SPOT_ITEMS.filter((i) => /ph|th|ch/.test(i.la)).length).toBeGreaterThanOrEqual(4);
  });
  it('sections: the voice test keeps every column; the spot-check is Gemini only', () => {
    expect(COMPARE_GROUPS.map((g) => g.id)).toEqual(['voice', 'spot']);
    expect(COMPARE_GROUPS[0]!.items).toBe(COMPARE_ITEMS);
    expect(COMPARE_GROUPS[0]!.columns).toEqual(COLUMNS.map((c) => c.id));
    expect(COMPARE_GROUPS[1]!.columns).toEqual(['gemini:plain', 'gemini:aspirated']);
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
  it('per section: only that section’s items and columns', () => {
    const r = (item: string, score: number): TtsRating => ({ item, engine: 'gemini', variant: 'plain', score, problems: [], note: '' });
    const ratings = [r('ph-th', 2), r('s1', 4), r('spot-deus', 5)];
    const voice = summarize(ratings, { items: COMPARE_ITEMS.map((i) => i.id) });
    expect(voice.find((c) => c.id === 'gemini:plain')).toMatchObject({ rated: 2, average: 3 });
    const spot = summarize(ratings, { items: SPOT_ITEMS.map((i) => i.id), columns: COLUMNS.filter((c) => c.engine === 'gemini') });
    expect(spot.map((c) => c.id)).toEqual(['gemini:plain', 'gemini:aspirated']);
    expect(spot[0]).toMatchObject({ rated: 1, average: 5 });
  });
});
