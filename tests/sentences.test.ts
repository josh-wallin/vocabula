/**
 * Sentence engine: word order, English normalization, eligibility, the four exercise
 * types and lesson integration. Uses a small invented lexicon (real Latin words, chapter
 * placement made up here) and invented sentences, not the bank.
 */
import { describe, expect, it } from 'vitest';
import type { CellId, Lemma, PartOfSpeech } from '../src/morph/types.ts';
import { lemmaFromHeadword } from '../src/morph/lemma.ts';
import { generate } from '../src/morph/generate.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { buildPath } from '../src/engine/path.ts';
import { featureOfCell, featuresAt, hasFeature, type FeatureId } from '../src/engine/curriculum.ts';
import { buildLesson, isSentence, LESSON_SIZE, PROBATIO_SIZE, REVIEW_SIZE, SENTENCES_PER_PROBATIO, type Exercise } from '../src/engine/lesson.ts';
import { replay, type VEvent } from '../src/engine/events.ts';
import { Session } from '../src/engine/session.ts';
import { parseCardId } from '../src/engine/srs.ts';
import { rng } from '../src/engine/util.ts';
import {
  acceptedEnglish, agreeingWords, buildSentenceExercise, canBuild, checkEnglish, checkLatinOrder, checkSentence, chooseSentences, displayEnglish,
  englishWords, expandEnglish, latinOrders, latinText, normalizeEnglish, orderError, parseSentenceCard, parseSentences,
  sentenceCard, sentenceEligible, tapCounts, type Sentence, type SentCtx, type SentenceExercise, type SentType, type Token,
} from '../src/engine/sentences.ts';

function W(chapter: number, order: number, headword: string, pos: PartOfSpeech, gloss: string): Lemma {
  const { lemma, inference } = lemmaFromHeadword(headword, pos, gloss, [{ book: 'wheelock', chapter, order }]);
  if (!lemma) throw new Error(`fixture: ${headword}: ${inference.reason}`);
  return lemma;
}

const LEMMAS: Lemma[] = [
  W(1, 1, 'amō, amāre', 'verb', 'love'),
  W(1, 2, 'videō, vidēre', 'verb', 'see'),
  W(1, 3, 'rīdeō, rīdēre', 'verb', 'laugh'),
  W(1, 4, 'nōn', 'adv', 'not'),
  W(1, 5, '-ne', 'adv', 'question marker'),
  W(1, 6, 'sī', 'conj', 'if'),
  W(2, 1, 'puella, puellae, f.', 'noun', 'girl'),
  W(2, 2, 'rosa, rosae, f.', 'noun', 'rose'),
  W(2, 3, 'et', 'conj', 'and'),
  W(2, 4, 'magnus, magna, magnum', 'adj', 'large'),
  W(3, 1, 'puer, puerī, m.', 'noun', 'boy'),
  W(3, 2, 'ager, agrī, m.', 'noun', 'field'),
  W(3, 3, 'in', 'prep', 'in'),
  W(3, 4, '-que', 'conj', 'and'),
  W(4, 1, 'dōnum, dōnī, n.', 'noun', 'gift'),
  W(4, 2, 'sum, esse', 'verb', 'be'),
];
const lex = buildLexicon(LEMMAS, []);
const path = buildPath(lex);
const ALL = new Set(LEMMAS.map((l) => l.id));
const ctxAt = (section: number, known: ReadonlySet<string> = ALL): SentCtx => ({ lex, known, unlocked: featuresAt(section, true), section });

const tok = (form: string, lemma: string, cell: string, extra: Partial<Token> = {}): Token => ({ form, lemma, cell: cell as CellId, ...extra });

const S = (raw: Partial<Sentence> & Pick<Sentence, 'id' | 'section' | 'tokens' | 'en'>): Sentence => parseSentences([raw])[0]!;

const girlLoves = S({
  id: 't-01', section: 2, en: ['The girl {loves|likes} [the] roses.', 'Roses are loved by the girl.'],
  tokens: [tok('puella', 'puella-n1', 'nom.sg', { role: 'subj' }), tok('rosās', 'rosa-n1', 'acc.pl', { role: 'obj' }), tok('amat', 'amo-v1', 'pres.act.ind.3sg', { role: 'verb' })],
});
const boyField = S({
  id: 't-02', section: 3, en: ['The boy sees the girl in the field.'],
  tokens: [tok('puer', 'puer-n2m', 'nom.sg', { role: 'subj' }), tok('in', 'in-indecl', 'citation', { phrase: 2 }), tok('agrō', 'ager-n2m', 'abl.sg'), tok('magnō', 'magnus-adj12', 'abl.sg.m'),
    tok('puellam', 'puella-n1', 'acc.sg', { role: 'obj' }), tok('videt', 'video-v2', 'pres.act.ind.3sg', { role: 'verb' })],
});
const notLove = S({
  id: 't-03', section: 2, en: ["The girl doesn't love roses."],
  tokens: [tok('puella', 'puella-n1', 'nom.sg', { role: 'subj' }), tok('rosās', 'rosa-n1', 'acc.pl', { role: 'obj' }), tok('nōn', 'non-indecl', 'citation'), tok('amat', 'amo-v1', 'pres.act.ind.3sg', { role: 'verb' })],
});
const que = S({
  id: 't-04', section: 3, en: ['[The] boys and girls laugh.'],
  tokens: [tok('puerī', 'puer-n2m', 'nom.pl', { role: 'subj' }), tok('puellae', 'puella-n1', 'nom.pl', { role: 'subj', attach: 'que' }), tok('rīdent', 'rideo-v2', 'pres.act.ind.3pl', { role: 'verb' })],
});
const ne = S({
  id: 't-05', section: 2, punct: '?', en: ['Do you love roses?', 'Do you love the roses?'],
  tokens: [tok('amās', 'amo-v1', 'pres.act.ind.2sg', { role: 'verb', attach: 'ne' }), tok('rosās', 'rosa-n1', 'acc.pl', { role: 'obj' })],
});
const coord = S({
  id: 't-06', section: 3, en: ['The girl and the boy laugh.'], order: ['free', ['coord', 0, 1, 2], 3],
  tokens: [tok('puella', 'puella-n1', 'nom.sg', { role: 'subj' }), tok('et', 'et-indecl', 'citation'), tok('puer', 'puer-n2m', 'nom.sg', { role: 'subj' }), tok('rīdent', 'rideo-v2', 'pres.act.ind.3pl', { role: 'verb' })],
});
const ifClause = S({
  id: 't-07', section: 1, en: ['If you laugh, I laugh.'], order: ['free', ['first', 0, 1], 2],
  tokens: [tok('sī', 'si-indecl', 'citation'), tok('rīdēs', 'rideo-v2', 'pres.act.ind.2sg', { role: 'verb', comma: true }), tok('rīdeō', 'rideo-v2', 'pres.act.ind.1sg', { role: 'verb' })],
});
const implied = S({
  id: 't-08', section: 1, en: ['You see.', 'You are seeing.'],
  tokens: [tok('nōn', 'non-indecl', 'citation'), tok('vidētis', 'video-v2', 'pres.act.ind.2pl', { role: 'verb' })],
});
const gift = S({
  id: 't-09', section: 4, en: ['The gift is large.'],
  tokens: [tok('dōnum', 'donum-n2n', 'nom.sg', { role: 'subj' }), tok('magnum', 'magnus-adj12', 'nom.sg.n', { role: 'pred' }), tok('est', 'sum-irr-sum', 'pres.act.ind.3sg', { role: 'verb' })],
});
const BANK = [girlLoves, boyField, notLove, que, ne, coord, ifClause, implied, gift];

const ok = (s: Sentence, line: string) => checkLatinOrder(s, line.split(' '));

describe('word order', () => {
  it('free order: every permutation of the right forms, nothing else', () => {
    expect(latinOrders(girlLoves).size).toBe(6);
    for (const l of ['puella rosās amat', 'rosās puella amat', 'amat rosās puella']) expect(ok(girlLoves, l), l).toBe(true);
    expect(ok(girlLoves, 'puella rosam amat')).toBe(false); // wrong form
    expect(ok(girlLoves, 'puella amat')).toBe(false); // missing word
    expect(ok(girlLoves, 'puella rosās amat amat')).toBe(false); // extra word
    expect(ok(girlLoves, 'puella rosas amat')).toBe(false); // tiles carry macrons; no near-miss
  });
  it('a prepositional phrase stays together, preposition first, its words in any order', () => {
    for (const l of ['puer in agrō magnō puellam videt', 'in magnō agrō puer videt puellam', 'videt puellam puer in agrō magnō']) expect(ok(boyField, l), l).toBe(true);
    for (const l of ['agrō in magnō puer puellam videt', 'in agrō puer magnō puellam videt', 'puer agrō magnō in puellam videt']) expect(ok(boyField, l), l).toBe(false);
  });
  it('nōn stays directly before its verb', () => {
    expect(ok(notLove, 'nōn amat puella rosās')).toBe(true);
    expect(ok(notLove, 'rosās puella nōn amat')).toBe(true);
    expect(ok(notLove, 'puella nōn rosās amat')).toBe(false);
    expect(ok(notLove, 'puella rosās amat nōn')).toBe(false);
  });
  it('-que stays on its word, after the word it joins; -ne stays first', () => {
    expect(ok(que, 'rīdent puerī puellaeque')).toBe(true);
    expect(ok(que, 'puellaeque puerī rīdent')).toBe(false);
    expect(ok(que, 'puerī rīdent puellaeque')).toBe(false);
    expect(ok(ne, 'amāsne rosās')).toBe(true);
    expect(ok(ne, 'rosās amāsne')).toBe(false);
    expect(latinText(que)).toBe('Puerī puellaeque rīdent.');
    expect(latinText(ne)).toBe('Amāsne rosās?');
  });
  it('explicit trees: coordination either way round; a sī clause stays whole, sī first', () => {
    expect(ok(coord, 'puer et puella rīdent')).toBe(true);
    expect(ok(coord, 'rīdent puella et puer')).toBe(true);
    expect(ok(coord, 'et puella puer rīdent')).toBe(false);
    expect(ok(coord, 'puella puer et rīdent')).toBe(false);
    expect(ok(ifClause, 'rīdeō sī rīdēs')).toBe(true);
    expect(ok(ifClause, 'rīdēs sī rīdeō')).toBe(false);
    expect(latinText(ifClause)).toBe('Sī rīdēs, rīdeō.');
  });
  it('rejects broken trees', () => {
    expect(orderError({ ...girlLoves, order: ['free', 0, 1] })).toMatch(/every token/);
    expect(orderError({ ...girlLoves, order: ['fixed', 2, 1, 0] })).toMatch(/written order/);
    expect(orderError({ ...girlLoves, order: ['coord', 0, 1] })).toMatch(/coord/);
    expect(() => parseSentences([{ ...girlLoves, order: ['free', 0, 1, 1] }])).toThrow(/t-01/);
    expect(() => parseSentences([{ ...girlLoves, tokens: [{ ...girlLoves.tokens[0]!, role: 'boss' }] }])).toThrow(/role/);
  });
});

describe('English answers', () => {
  it('expands alternatives and optional words; shows the first full reading', () => {
    expect(expandEnglish('The girl {loves|likes} [the] roses.').sort()).toEqual(
      ['The girl likes roses.', 'The girl likes the roses.', 'The girl loves roses.', 'The girl loves the roses.']);
    expect(displayEnglish('The girl {loves|likes} [the] roses.')).toBe('The girl loves the roses.');
    expect(englishWords("The poet's {fame|glory} is great!")).toEqual(['the', "poet's", 'fame', 'is', 'great']);
    expect(englishWords('I praise Cicero.')).toEqual(['I', 'praise', 'Cicero']);
  });
  it('normalizes case, punctuation, curly quotes and contractions', () => {
    expect(normalizeEnglish('  The GIRL, loves roses!! ')).toBe('the girl loves roses');
    expect(normalizeEnglish("doesn't")).toBe('does not');
    expect(normalizeEnglish('can’t')).toBe('can not');
    expect(normalizeEnglish('cannot')).toBe('can not');
    expect(normalizeEnglish("won't")).toBe('will not');
    expect(normalizeEnglish("I'm here")).toBe('i am here');
    expect(normalizeEnglish("the poet's fame")).toBe("the poet's fame");
  });
  it('will = shall, O = Oh, British -our = American -or, both ways', () => {
    expect(normalizeEnglish('We shall dine')).toBe(normalizeEnglish('We will dine'));
    expect(normalizeEnglish("We shan't dine")).toBe(normalizeEnglish('We will not dine'));
    expect(normalizeEnglish('Oh my country')).toBe(normalizeEnglish('O my country'));
    for (const [gb, us] of [['labour', 'labor'], ['favourable', 'favorable'], ['valour', 'valor'], ['honours', 'honors'], ['colour', 'color']] as const) {
      expect(normalizeEnglish(gb)).toBe(normalizeEnglish(us));
    }
    expect(normalizeEnglish('four hours')).toBe('four hours'); // not -our words
    const s = S({ id: 't-11', section: 2, en: ['After labor we will love the rose.'],
      tokens: [tok('rosam', 'rosa-n1', 'acc.sg', { role: 'obj' }), tok('amābimus', 'amo-v1', 'fut.act.ind.1pl', { role: 'verb' })] });
    expect(checkEnglish(s, 'After labour we shall love the rose')).toBe(true);
  });
  it('a distractor tile is never an equivalent of an accepted word (shall for will)', () => {
    const s = S({ id: 't-12', section: 1, en: ['We will not laugh.'], tokens: [tok('nōn', 'non-indecl', 'citation'), tok('rīdēbimus', 'rideo-v2', 'fut.act.ind.1pl', { role: 'verb' })] });
    const pool = [S({ ...girlLoves, id: 't-13', en: ['Shall the girl love roses?'] })];
    for (let seed = 1; seed < 10; seed++) {
      const ex = buildSentenceExercise(s, 'en', { ...deps(4, seed), pool })!;
      expect(ex.options.map((o) => o.text.toLowerCase())).not.toContain('shall');
    }
  });
  it('a / an / the are interchangeable, but an article present or absent still counts', () => {
    expect(normalizeEnglish('A girl loves an apple')).toBe(normalizeEnglish('the girl loves the apple'));
    expect(checkEnglish(girlLoves, 'A girl likes the roses')).toBe(true);
    expect(checkEnglish(girlLoves, 'the girl loves roses')).toBe(true);
    expect(checkEnglish(girlLoves, 'girl loves roses')).toBe(false);
    expect(checkEnglish(girlLoves, 'The girl loves the the roses')).toBe(false);
    expect(checkEnglish(girlLoves, 'Roses are loved by the girl.')).toBe(true);
    expect(checkEnglish(girlLoves, 'The girl loves the rose')).toBe(false);
    expect(checkEnglish(notLove, 'The girl does not love roses')).toBe(true);
    expect(acceptedEnglish(girlLoves).size).toBe(5);
  });
});

describe('eligibility', () => {
  it('needs the section reached, every word known, every ending unlocked', () => {
    expect(sentenceEligible(girlLoves, ctxAt(2))).toBe(true);
    expect(sentenceEligible(girlLoves, ctxAt(1))).toBe(false); // section 2 sentence
    expect(sentenceEligible(girlLoves, ctxAt(2, new Set([...ALL].filter((x) => x !== 'rosa-n1'))))).toBe(false);
    expect(sentenceEligible(gift, { ...ctxAt(4), unlocked: featuresAt(4, false) })).toBe(false); // n2n not yet unlocked
    expect(sentenceEligible(que, ctxAt(3, new Set([...ALL].filter((x) => x !== 'que-enclitic'))))).toBe(false);
    const wrongForm = { ...girlLoves, tokens: [{ ...girlLoves.tokens[0]!, form: 'puellā' }, ...girlLoves.tokens.slice(1)] };
    expect(sentenceEligible(wrongForm, ctxAt(4))).toBe(false);
    const unknownLemma = { ...girlLoves, tokens: [{ ...girlLoves.tokens[0]!, lemma: 'nauta-n1' }, ...girlLoves.tokens.slice(1)] };
    expect(sentenceEligible(unknownLemma, ctxAt(4))).toBe(false);
  });
});

let n = 0;
const deps = (section: number, seed = 1, extra: Partial<SentCtx> = {}) => ({ ...ctxAt(section), ...extra, rng: rng(seed), nextId: () => `x${++n}`, pool: BANK });
const build = (s: Sentence, type: SentType, section = 4, seed = 1) => buildSentenceExercise(s, type, deps(section, seed))!;
const textOf = (ex: SentenceExercise, id: string) => ex.options.find((o) => o.id === id)!.text;
const idsFor = (ex: SentenceExercise, words: string[]) => {
  const used = new Set<string>();
  return words.map((w) => { const o = ex.options.find((x) => x.text === w && !used.has(x.id))!; used.add(o.id); return o.id; });
};

describe('cloze', () => {
  it('four distinct forms of the blanked lemma, all from unlocked cells', () => {
    for (const section of [2, 3, 4]) {
      for (let seed = 1; seed < 15; seed++) {
        const ex = build(girlLoves, 'cloze', section, seed);
        const i = ex.words.findIndex((w) => w.blank);
        const t = girlLoves.tokens[i]!;
        const l = lex.byId.get(t.lemma)!.lemma;
        const forms = generate(l);
        const unlocked = featuresAt(section, true);
        expect(new Set(ex.options.map((o) => o.text)).size).toBe(4);
        expect(ex.options.find((o) => o.id === 'a')!.text).toBe(t.form);
        for (const o of ex.options) {
          const cells = (Object.keys(forms) as (keyof typeof forms)[]).filter((c) => forms[c] === o.text);
          expect(cells.some((c) => { const f = featureOfCell(l, c); return f !== null && hasFeature(unlocked, f); }), `${o.text} @${section}`).toBe(true);
        }
        expect(ex.en).toBe('The girl loves the roses.');
      }
    }
  });
  it('locked endings never appear: in section 2 a verb has no future or imperfect forms', () => {
    const forms = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const ex = buildSentenceExercise(girlLoves, 'cloze', deps(2, seed))!;
      if (ex.words[2]!.blank) ex.options.forEach((o) => forms.add(o.text));
    }
    expect(forms.size).toBeGreaterThan(3);
    for (const f of forms) expect(f.includes('b'), f).toBe(false); // amābit, amābat…
  });
  it('never offers the other "you" (2nd sg. vs 2nd pl.) as a wrong answer', () => {
    for (let seed = 1; seed < 20; seed++) {
      const ex = buildSentenceExercise(implied, 'cloze', deps(1, seed))!;
      expect(ex.options.map((o) => o.text)).not.toContain('vidēs');
    }
  });
  it('checks the picked form', () => {
    const ex = build(girlLoves, 'cloze');
    expect(checkSentence(ex, ['a']).ok).toBe(true);
    expect(checkSentence(ex, [ex.options.find((o) => o.id !== 'a')!.id]).ok).toBe(false);
    expect(checkSentence(ex, ['a']).expected).toBe(ex.options.find((o) => o.id === 'a')!.text);
  });
  it('needs a declinable word with enough unlocked forms', () => {
    const onlyIndecl = S({ id: 't-10', section: 1, en: ['If not.'], order: ['fixed', 0, 1], tokens: [tok('sī', 'si-indecl', 'citation'), tok('nōn', 'non-indecl', 'citation')] });
    expect(canBuild(onlyIndecl, 'cloze', ctxAt(4))).toBe(false);
    expect(canBuild(gift, 'cloze', ctxAt(4))).toBe(true);
  });
});

describe('Latin → English tiles', () => {
  it('the reference words plus 2–3 distractors that fit no accepted answer', () => {
    const ex = build(girlLoves, 'en');
    const ref = ex.answer.map((id) => textOf(ex, id));
    expect(ref.join(' ')).toBe('the girl loves the roses');
    const extra = ex.options.filter((o) => o.id.startsWith('d'));
    expect(extra.length).toBeGreaterThanOrEqual(2);
    expect(extra.length).toBeLessThanOrEqual(3);
    const words = new Set([...acceptedEnglish(girlLoves)].flatMap((e) => e.split(' ')));
    for (const d of extra) expect(words.has(normalizeEnglish(d.text)), d.text).toBe(false);
  });
  it('still gets distractors when no other sentence is available (glosses, then common words)', () => {
    const ex = buildSentenceExercise(girlLoves, 'en', { ...deps(4), pool: [] })!;
    const extra = ex.options.filter((o) => o.id.startsWith('d'));
    expect(extra.length).toBe(3);
    const words = new Set([...acceptedEnglish(girlLoves)].flatMap((e) => e.split(' ')));
    for (const d of extra) expect(words.has(normalizeEnglish(d.text)), d.text).toBe(false);
  });
  it('accepts any accepted variant, rejects distractors and bad order', () => {
    const ex = build(girlLoves, 'en');
    expect(checkSentence(ex, ex.answer).ok).toBe(true);
    expect(checkSentence(ex, idsFor(ex, ['the', 'girl', 'loves', 'roses'])).ok).toBe(true); // the 2nd article left out
    expect(checkSentence(ex, idsFor(ex, ['girl', 'the', 'loves', 'the', 'roses'])).ok).toBe(false);
    expect(checkSentence(ex, [...ex.answer, ex.options.find((o) => o.id.startsWith('d'))!.id]).ok).toBe(false);
    expect(checkSentence(ex, []).ok).toBe(false);
  });
});

describe('tap the subject / object', () => {
  it('marks the subject word(s); an implied subject is "no written subject"', () => {
    const s1 = build(girlLoves, 'subj');
    expect(s1.answer).toEqual(['w0']);
    expect(s1.options.at(-1)).toMatchObject({ id: 'none' });
    expect(checkSentence(s1, ['w0']).ok).toBe(true);
    expect(checkSentence(s1, ['w1']).ok).toBe(false);
    expect(checkSentence(s1, ['none']).ok).toBe(false);
    const s2 = build(implied, 'subj', 1);
    expect(s2.answer).toEqual(['none']);
    expect(checkSentence(s2, ['none']).ok).toBe(true);
    expect(checkSentence(s2, ['w1']).ok).toBe(false);
    const s3 = build(que, 'subj', 3);
    expect(s3.multi).toBe(true);
    expect(checkSentence(s3, ['w1', 'w0']).ok).toBe(true);
    expect(checkSentence(s3, ['w0']).ok).toBe(false);
  });
  it('object exercises need a written object; two-verb sentences get neither', () => {
    const o = build(girlLoves, 'obj');
    expect(o.answer).toEqual(['w1']);
    expect(o.options.some((x) => x.id === 'none')).toBe(false);
    expect(canBuild(implied, 'obj', ctxAt(4))).toBe(false);
    expect(canBuild(ifClause, 'subj', ctxAt(4))).toBe(false);
  });
  it('demonstratives: alone they are the subject / object; with a noun, the noun is', () => {
    const dlex = buildLexicon([...LEMMAS, W(9, 1, 'hic, haec, hoc', 'pron', 'this'), W(9, 2, 'ille, illa, illud', 'pron', 'that')], []);
    const d = { lex: dlex, known: new Set(dlex.words.map((w) => w.lemma.id)), unlocked: featuresAt(9, true), section: 9, rng: rng(1), nextId: () => `x${++n}`, pool: BANK };
    // Hic illam videt. "This man sees that woman."
    const pron = S({ id: 't-d1', section: 9, en: ['{This man|He} sees {that woman|her}.'], tokens: [
      tok('hic', 'hic-pron-hic', 'nom.sg.m', { role: 'subj' }), tok('illam', 'ille-pron-ille', 'acc.sg.f', { role: 'obj' }), tok('videt', 'video-v2', 'pres.act.ind.3sg', { role: 'verb' })] });
    expect(sentenceEligible(pron, d)).toBe(true);
    const s = buildSentenceExercise(pron, 'subj', d)!;
    expect(s.answer).toEqual(['w0']);
    expect(s.note).toMatch(/^hic \(.*\): the subject\./);
    expect(buildSentenceExercise(pron, 'obj', d)!.answer).toEqual(['w1']);
    expect(checkEnglish(pron, 'He sees her')).toBe(true);
    expect(checkEnglish(pron, 'This man sees her')).toBe(true);
    // Hic puer illam puellam videt. "This boy sees that girl."
    const adj = S({ id: 't-d2', section: 9, en: ['This boy sees that girl.'], tokens: [
      tok('hic', 'hic-pron-hic', 'nom.sg.m'), tok('puer', 'puer-n2m', 'nom.sg', { role: 'subj' }),
      tok('illam', 'ille-pron-ille', 'acc.sg.f'), tok('puellam', 'puella-n1', 'acc.sg', { role: 'obj' }), tok('videt', 'video-v2', 'pres.act.ind.3sg', { role: 'verb' })] });
    const as = buildSentenceExercise(adj, 'subj', d)!;
    expect(as.answer).toEqual(['w1']);
    expect(as.groups).toEqual([['w1', 'w0']]);
    expect(as.multi).toBe(false);
    // The agreeing demonstrative counts as tapping the subject: hic, puer, or both; never another word.
    expect(checkSentence(as, ['w1']).ok).toBe(true);
    expect(checkSentence(as, ['w0']).ok).toBe(true);
    expect(checkSentence(as, ['w0', 'w1']).ok).toBe(true);
    expect(checkSentence(as, ['w2']).ok).toBe(false);
    expect(checkSentence(as, ['w1', 'w3']).ok).toBe(false);
    expect(checkSentence(as, ['none']).ok).toBe(false);
    expect(tapCounts(as, 'w0', ['w0'])).toEqual({ right: true, missed: false });
    expect(tapCounts(as, 'w1', ['w0'])).toEqual({ right: false, missed: false });
    expect(tapCounts(as, 'w1', ['w2'])).toEqual({ right: true, missed: true });
    const ao = buildSentenceExercise(adj, 'obj', d)!;
    expect(ao.answer).toEqual(['w3']);
    expect(checkSentence(ao, ['w2']).ok).toBe(true);
    expect(checkSentence(ao, ['w0']).ok).toBe(false);
    // Generally: adjectives agreeing in case, number and gender; not one inside a preposition's unit, nor a different gender.
    const gen = S({ id: 't-d3', section: 9, en: ['The big boy sees a girl in the big field.'], tokens: [
      tok('puer', 'puer-n2m', 'nom.sg', { role: 'subj' }), tok('magnus', 'magnus-adj12', 'nom.sg.m'),
      tok('in', 'in-indecl', 'citation', { phrase: 2 }), tok('agrō', 'ager-n2m', 'abl.sg'), tok('magnō', 'magnus-adj12', 'abl.sg.m'),
      tok('puellam', 'puella-n1', 'acc.sg', { role: 'obj' }), tok('videt', 'video-v2', 'pres.act.ind.3sg', { role: 'verb' })] });
    expect(agreeingWords(gen, 0, dlex)).toEqual([1]);
    expect(agreeingWords(gen, 5, dlex)).toEqual([]);
    expect(buildSentenceExercise(gen, 'obj', d)!.groups).toBeUndefined();
    expect(agreeingWords(pron, 0, dlex)).toEqual([]);
    // Latin tiles: the demonstrative may stand on either side of its noun; distractors are other forms of hic / ille.
    expect(checkLatinOrder(adj, ['puer', 'hic', 'puellam', 'illam', 'videt'])).toBe(true);
    const la = buildSentenceExercise(adj, 'la', d)!;
    const extra = la.options.filter((o) => o.id.startsWith('d')).map((o) => o.text);
    expect(extra.length).toBe(2);
    for (const f of extra) expect(['hic', 'puer', 'illam', 'puellam', 'videt']).not.toContain(f);
  });
});

describe('English → Latin tiles', () => {
  it('tiles: the sentence’s forms plus 1–2 wrong forms of the same lemmas (unlocked cells only)', () => {
    for (let seed = 1; seed < 20; seed++) {
      const ex = buildSentenceExercise(boyField, 'la', deps(3, seed))!;
      const extra = ex.options.filter((o) => o.id.startsWith('d'));
      expect(extra.length).toBeGreaterThanOrEqual(1);
      expect(extra.length).toBeLessThanOrEqual(2);
      const forms = new Set(boyField.tokens.map((t) => t.form));
      const unlocked = featuresAt(3, true);
      for (const d of extra) {
        expect(forms.has(d.text)).toBe(false);
        const hit = boyField.tokens.some((t) => {
          const l = lex.byId.get(t.lemma)!.lemma;
          const g = generate(l);
          return (Object.keys(g) as (keyof typeof g)[]).some((c) => g[c] === d.text && hasFeature(unlocked, featureOfCell(l, c) as FeatureId));
        });
        expect(hit, d.text).toBe(true);
      }
    }
  });
  it('accepts free order with the units kept; rejects a wrong form or a broken unit', () => {
    const ex = build(boyField, 'la', 3);
    expect(checkSentence(ex, ex.answer).ok).toBe(true);
    expect(checkSentence(ex, idsFor(ex, ['in', 'magnō', 'agrō', 'puellam', 'videt', 'puer'])).ok).toBe(true);
    expect(checkSentence(ex, idsFor(ex, ['puer', 'agrō', 'in', 'magnō', 'puellam', 'videt'])).ok).toBe(false);
    const d = ex.options.find((o) => o.id.startsWith('d'))!;
    const swapped = ex.answer.map((id) => (textOf(ex, id).slice(0, 3) === d.text.slice(0, 3) ? d.id : id));
    expect(checkSentence(ex, swapped).ok).toBe(false);
    expect(checkSentence(ex, ex.answer.slice(1)).ok).toBe(false);
    expect(ex.expected).toBe('Puer in agrō magnō puellam videt.');
    const q = build(que, 'la', 3);
    expect(q.options.map((o) => o.text)).toContain('puellaeque');
  });
});

describe('cards', () => {
  it('sent:<id>:<type> ids round-trip and never parse as word cards', () => {
    expect(sentenceCard('s02-01', 'la')).toBe('sent:s02-01:la');
    expect(parseSentenceCard('sent:s02-01:la')).toEqual({ id: 's02-01', type: 'la' });
    expect(parseSentenceCard('sent:s02-01:bogus')).toBeNull();
    expect(parseCardId('sent:s02-01:la')).toBeNull();
  });
});

/* ---------------- lesson integration ---------------- */

const node = (id: string) => path.nodes.find((x) => x.id === id)!;
const T0 = Date.parse('2026-11-03T10:00:00Z');
function eventsUpTo(upTo: string): VEvent[] {
  const events: VEvent[] = [];
  let ts = T0;
  for (const nd of path.nodes) {
    if (nd.id === upTo) break;
    for (const w of nd.newWords) events.push({ id: `r-${nd.id}-${w}`, device: 'd', ts: ts++, kind: 'review', card: `${w}:meaning`, grade: 'good' });
    events.push({ id: `n-${nd.id}`, device: 'd', ts: ts++, kind: 'node_done', body: { node: nd.id, run: nd.id, stats: { exercises: 0, graded: 0, firstTryCorrect: 0, newWords: nd.newWords, reviews: 0 } } });
  }
  return events;
}
const lesson = (id: string, opts: { sentences?: readonly Sentence[]; extra?: VEvent[]; seed?: string; days?: number } = {}): Exercise[] => {
  const nd = node(id);
  return buildLesson(nd, {
    lex, path, state: replay([...eventsUpTo(id), ...(opts.extra ?? [])]), now: new Date(T0 + 86400000 * (opts.days ?? 5)),
    unlocked: new Set(nd.unlocked), seed: opts.seed ?? 'seed', ...(opts.sentences ? { sentences: opts.sentences } : {}),
  });
};
const sents = (ex: Exercise[]) => ex.filter(isSentence);

describe('lessons with sentences', () => {
  const lastRep = path.sections[3]!.nodes.filter((x) => x.kind === 'repetitio').at(-1)!.id;
  it('Repetītiō: 2–4 sentence exercises, same length', () => {
    const ex = lesson(lastRep, { sentences: BANK });
    expect(ex.length).toBe(REVIEW_SIZE);
    expect(sents(ex).length).toBeGreaterThanOrEqual(2);
    expect(sents(ex).length).toBeLessThanOrEqual(4);
    expect(new Set(sents(ex).map((e) => e.card)).size).toBe(sents(ex).length);
  });
  it('Fōrmae: 2–3 sentence exercises, same length as without', () => {
    const without = lesson('s4.formae');
    const ex = lesson('s4.formae', { sentences: BANK });
    expect(ex.length).toBe(without.length);
    expect(ex.length).toBe(LESSON_SIZE - 1);
    expect(sents(ex).length).toBeGreaterThanOrEqual(2);
    expect(sents(ex).length).toBeLessThanOrEqual(3);
  });
  it('Probātiō: more sentences, still 20', () => {
    const p = path.nodes.find((x) => x.kind === 'probatio')!;
    const ex = lesson(p.id, { sentences: BANK });
    // This tiny lexicon can't fill 20 word exercises; the sentences take the place of words, never add length.
    const words = lesson(p.id).length;
    expect(ex.length).toBe(Math.min(PROBATIO_SIZE, words + SENTENCES_PER_PROBATIO));
    expect(ex.length).toBeLessThanOrEqual(PROBATIO_SIZE);
    expect(sents(ex).length).toBe(SENTENCES_PER_PROBATIO);
  });
  it('only unlocked sentences, and none in Verba / pattern lessons', () => {
    for (const nd of path.nodes) {
      const ex = lesson(nd.id, { sentences: BANK });
      if (nd.kind === 'verba' || nd.kind === 'pattern' || nd.kind === 'dcc') expect(sents(ex)).toEqual([]);
      const known = new Set(path.knownAt(nd.id));
      for (const e of sents(ex)) {
        expect(e.s.section, `${nd.id} ${e.sentence}`).toBeLessThanOrEqual(nd.section);
        expect(sentenceEligible(e.s, { lex, known, unlocked: new Set(nd.unlocked), section: nd.section }), `${nd.id} ${e.sentence}`).toBe(true);
      }
    }
  });
  it('no bank (or an empty one): exactly the old lessons', () => {
    for (const id of [lastRep, 's4.formae', 's2.formae']) {
      expect(JSON.stringify(lesson(id, { sentences: [] }))).toBe(JSON.stringify(lesson(id)));
    }
  });
  it('deterministic for a seed', () => {
    expect(JSON.stringify(lesson(lastRep, { sentences: BANK, seed: 'a' }))).toBe(JSON.stringify(lesson(lastRep, { sentences: BANK, seed: 'a' })));
  });
  it('a missed sentence card comes back first once due', () => {
    const card = sentenceCard('t-04', 'la');
    const miss: VEvent = { id: 'miss', device: 'd', ts: T0 + 86400000, kind: 'review', card, grade: 'again' };
    for (const seed of ['a', 'b', 'c']) {
      const ex = lesson(lastRep, { sentences: BANK, extra: [miss], seed, days: 4 });
      expect(sents(ex).map((e) => e.card), seed).toContain(card);
    }
  });
  it('chooseSentences spreads exercise types and uses one sentence once when it can', () => {
    const picks = chooseSentences({ ...ctxAt(4), bank: BANK, state: { cards: new Map() }, now: new Date(T0), count: 6, rng: rng(3) });
    expect(picks.length).toBe(6);
    expect(new Set(picks.map((p) => p.s.id)).size).toBe(6);
    const per = new Map<string, number>();
    for (const p of picks) per.set(p.type, (per.get(p.type) ?? 0) + 1);
    for (const v of per.values()) expect(v).toBeLessThanOrEqual(2);
    // With one eligible sentence, two different types of it.
    const one = chooseSentences({ ...ctxAt(4), bank: [girlLoves], state: { cards: new Map() }, now: new Date(T0), count: 2, rng: rng(3) });
    expect(one.length).toBe(2);
    expect(new Set(one.map((p) => p.type)).size).toBe(2);
  });
  it('a session grades a sentence exercise once and records its sent: card; replay schedules it', () => {
    const ex = lesson(lastRep, { sentences: BANK });
    const s = new Session(ex);
    let rec: { card: string; grade: string } | null = null;
    while (!s.done) {
      const cur = s.current!.ex;
      if (cur.type === 'sentence' && !rec) {
        const o = s.answer(cur.answer);
        expect(o.ok).toBe(true);
        rec = { card: o.card!, grade: o.grade! };
      } else if (cur.type === 'choice') s.answer(cur.answer);
      else if (cur.type === 'typed') s.answer(cur.accepted[0]!);
      else if (cur.type === 'sentence') s.answer(cur.answer);
      s.advance();
    }
    expect(rec!.card).toMatch(/^sent:t-\d\d:(cloze|en|subj|obj|la)$/);
    expect(rec!.grade).toBe('good');
    const st = replay([{ id: 'x', device: 'd', ts: T0, kind: 'review', card: rec!.card, grade: 'good' }]);
    expect(st.cards.has(rec!.card)).toBe(true);
    expect(st.seen.size).toBe(0);
    expect(st.puncta).toBe(2);
  });
  it('a wrong sentence answer is requeued as an ungraded retry', () => {
    const ex = lesson(lastRep, { sentences: BANK });
    const s = new Session(ex);
    while (s.current!.ex.type !== 'sentence') s.advance();
    const cur = s.current!.ex as SentenceExercise;
    const wrong = cur.kind === 'en' || cur.kind === 'la' ? cur.answer.slice(1) : [cur.options.find((o) => !cur.answer.includes(o.id))!.id];
    const o = s.answer(wrong);
    expect(o.ok).toBe(false);
    expect(o.grade).toBe('again');
    expect(s.queue.filter((q) => q.ex === cur).length).toBe(2);
  });
});
