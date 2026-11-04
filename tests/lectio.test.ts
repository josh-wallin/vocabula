/**
 * Lectiō reading passages (content/lectio/sNN.json, original Latin). Shape, text, glosses,
 * placement, gating, grading, events, flags and audio always run (fixture lexicon); the
 * vocabulary/grammar check against the curriculum (the sentence bank's rules: a Wheelock word
 * taught by the passage's section, a generated form, an unlocked ending) needs the private
 * Wheelock list and is skipped without it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lectioPassages } from '../src/content/lectio.ts';
import {
  buildLectio, compactCells, formCells, lectioQuestionCard, lectioText, parseLectio, parseLectioCard, parseLectioFile,
  shortCell, tokenProblem, wordInfo, wordInfoLine, type Lectio, type LectioScreen,
} from '../src/engine/lectio.ts';
import { buildPath, currentNodeIndex, isUnlocked, nodeStatus } from '../src/engine/path.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { buildLesson, parseListenCard, type ChoiceExercise, type Exercise } from '../src/engine/lesson.ts';
import { Session } from '../src/engine/session.ts';
import { parseEvent } from '../src/engine/eventShape.ts';
import { replay, type VEvent } from '../src/engine/events.ts';
import { parseCardId } from '../src/engine/srs.ts';
import { latinText, parseSentenceCard } from '../src/engine/sentences.ts';
import { sentenceBank } from '../src/content/sentenceBank.ts';
import { listeningLessons } from '../src/content/listening.ts';
import { featuresAt } from '../src/engine/curriculum.ts';
import { flagRef, flagShown } from '../src/ui/Flag.tsx';
import { exerciseAudio } from '../src/audio/exercise.ts';
import { audioItems, EXTRA_AUDIO_TEXTS, formAudio } from '../src/audio/items.ts';
import { lectioTexts, listeningWordTexts, readSentenceBank } from '../scripts/audio-manifest.ts';
import { parseLemmaList } from '../src/data/loader.ts';
import { parsePack } from '../src/data/pack.ts';
import { dccLemmas } from '../src/content/dccList.ts';
import type { Lemma } from '../src/morph/types.ts';
import { fixLexicon } from './fixtures.ts';

const DIR = resolve(__dirname, '../content/lectio');
const files = readdirSync(DIR).filter((f) => /^s\d\d\.json$/.test(f)).sort();
const passages = lectioPassages();
const byId = new Map(passages.map((p) => [p.id, p]));

describe('Lectiō: passages', () => {
  it('files s01–s10, 1–2 passages each, ids lNN-k in order, section = file', () => {
    expect(files).toEqual(['s01.json', 's02.json', 's03.json', 's04.json', 's05.json', 's06.json', 's07.json', 's08.json', 's09.json', 's10.json']);
    let total = 0;
    for (const f of files) {
      const n = Number(f.slice(1, 3));
      const list = parseLectioFile(JSON.parse(readFileSync(resolve(DIR, f), 'utf8')));
      expect(list.length, f).toBeGreaterThanOrEqual(1);
      expect(list.length, f).toBeLessThanOrEqual(2);
      list.forEach((p, i) => { expect(p.section).toBe(n); expect(p.id).toBe(`l${String(n).padStart(2, '0')}-${i + 1}`); });
      total += list.length;
    }
    expect(passages.length).toBe(total);
    expect(passages.map((p) => p.section)).toEqual([...passages.map((p) => p.section)].sort((a, b) => a - b));
  });

  it('5–10 sentences of 3–9 words; 3–4 questions; English for every sentence; notes point at words', () => {
    for (const p of passages) {
      expect(p.sentences.length, p.id).toBeGreaterThanOrEqual(5);
      expect(p.sentences.length, p.id).toBeLessThanOrEqual(10);
      expect(p.questions.length, p.id).toBeGreaterThanOrEqual(3);
      for (const s of p.sentences) {
        expect(s.tokens.length, `${p.id}: ${lectioText(s)}`).toBeGreaterThanOrEqual(3);
        expect(s.tokens.length, `${p.id}: ${lectioText(s)}`).toBeLessThanOrEqual(9);
        expect(s.en.trim().length).toBeGreaterThan(0);
      }
      for (const n of p.notes ?? []) expect(p.sentences[n.s]?.tokens[n.t], `${p.id} note ${n.s}.${n.t}`).toBeDefined();
      // Proper names are glossed in the passage.
      for (const s of p.sentences) for (const t of s.tokens) if (t.proper) expect(t.gloss, `${p.id} ${t.form}`).toBeTruthy();
    }
  });

  it('Latin is unique across passages and never repeats a sentence-bank sentence', () => {
    const all = passages.flatMap((p) => p.sentences.map((s) => lectioText(s).toLowerCase()));
    expect(new Set(all).size).toBe(all.length);
    const bank = new Set(sentenceBank().map((s) => latinText(s).toLowerCase()));
    for (const t of all) expect(bank.has(t), t).toBe(false);
  });

  it('the validator rejects broken passages', () => {
    const p = byId.get('l03-1')!;
    const clone = (): Lectio => JSON.parse(JSON.stringify(p)) as Lectio;
    expect(parseLectio(clone()).id).toBe('l03-1');
    const a = clone(); a.section = 4;
    expect(() => parseLectio(a)).toThrow(/section/);
    const b = clone(); b.sentences[0]!.tokens = b.sentences[0]!.tokens.slice(0, 2);
    expect(() => parseLectio(b)).toThrow(/3–9 words/);
    const c = clone(); c.questions[0]!.answer = 9;
    expect(() => parseLectio(c)).toThrow(/answer/);
    const d = clone(); d.sentences[0]!.tokens[0] = { ...d.sentences[0]!.tokens[0]!, lemma: 'proper' };
    expect(() => parseLectio(d)).toThrow(/proper/);
    const e = clone(); e.notes = [{ s: 0, t: 40, note: 'x' }];
    expect(() => parseLectio(e)).toThrow(/note/);
  });

  it('prints sentences with capitals, commas, enclitics and end punctuation', () => {
    const l1 = byId.get('l01-1')!;
    expect(lectioText(l1.sentences[0]!)).toBe('Mārce, saepe errās!');
    expect(lectioText(byId.get('l06-1')!.sentences[5]!)).toBe('Dī deaeque patriam iuvābant.');
    expect(lectioText(byId.get('l05-1')!.sentences.at(-1)!)).toBe('Remanēbitne Sextus in patriā?');
  });
});

/* ---------------- glosses and parses (fixture lexicon) ---------------- */

const tok = (form: string, lemma: string, cell: string, extra: object = {}) => ({ form, lemma, cell, ...extra }) as Lectio['sentences'][number]['tokens'][number];
const FIX_PASSAGE: Lectio = {
  id: 'l02-9', section: 2, title: 'Stellae', titleEn: 'Stars', context: 'A test passage.',
  sentences: [
    { tokens: [tok('incola', 'incola-n1', 'nom.sg'), tok('stellās', 'stella-n1', 'acc.pl'), tok('nārrat', 'narro-v1', 'pres.act.ind.3sg')], en: 'The inhabitant tells of stars.' },
    { tokens: [tok('lūna', 'luna-n1', 'nom.sg'), tok('stellae', 'stella-n1', 'gen.sg'), tok('altae', 'altus-adj12', 'gen.sg.f'), tok('lūcet', 'luceo-v2', 'pres.act.ind.3sg')], en: 'The moon of the high star shines.' },
    { tokens: [tok('Mārce', 'proper', 'voc.sg', { proper: true, gloss: 'Marcus (a name)', comma: true }), tok('rīdē', 'rideo-v2', 'pres.act.imp.2sg'), tok('casaeque', 'casa-n1', 'nom.pl')], en: 'Marcus, laugh!' },
    { tokens: [tok('sed', 'sed-indecl', 'citation'), tok('incolae', 'incola-n1', 'nom.pl'), tok('sedent', 'sedeo-v2', 'pres.act.ind.3pl')], en: 'But the inhabitants sit.' },
    { tokens: [tok('nunc', 'nunc-indecl', 'citation'), tok('ambulāre', 'ambulo-v1', 'pres.act.inf'), tok('clāmant', 'clamo-v1', 'pres.act.ind.3pl')], en: 'Now they shout to walk.' },
  ],
  questions: [{ q: 'Who tells?', options: ['The inhabitant', 'The moon'], answer: 0 }, { q: 'True?', options: ['True', 'False'], answer: 1 }, { q: 'What shines?', options: ['The moon', 'A hut', 'A wolf'], answer: 0 }],
  notes: [{ s: 1, t: 1, note: 'genitive: of the star' }],
};
FIX_PASSAGE.sentences[2]!.tokens[2]!.form = 'casae';
FIX_PASSAGE.sentences[2]!.tokens[2]!.attach = 'que';

describe('Lectiō: glosses and parses', () => {
  const lex = fixLexicon();
  it('short and compact cell labels', () => {
    expect(shortCell('gen.sg')).toBe('gen. sg.');
    expect(shortCell('abl.pl.f')).toBe('abl. pl. f.');
    expect(shortCell('impf.act.ind.3pl')).toBe('3rd pl. imperfect');
    expect(shortCell('pres.act.ind.1sg')).toBe('1st sg. present');
    expect(shortCell('pres.act.inf')).toBe('infinitive');
    expect(shortCell('pres.act.imp.2pl')).toBe('imperative pl.');
    expect(compactCells(['gen.sg', 'dat.sg', 'nom.pl'])).toBe('gen./dat. sg. or nom. pl.');
  });
  it('puellae-style: every unlocked reading, the vocative left out when it equals the nominative', () => {
    const stella = lex.byId.get('stella-n1')!.lemma;
    expect(formCells(stella, 'stellae', featuresAt(2, true))).toEqual(['gen.sg', 'dat.sg', 'nom.pl']);
    expect(formCells(stella, 'stellae', featuresAt(1, true))).toEqual([]); // 1st declension not unlocked yet
    const i = wordInfo(lex, FIX_PASSAGE, 1, 1);
    expect(i).toMatchObject({ word: 'stellae', head: 'stella, stellae f.', gloss: 'star', parse: 'gen./dat. sg. or nom. pl.', here: 'gen. sg.', note: 'genitive: of the star' });
    expect(wordInfoLine(i)).toBe('stellae — star; gen./dat. sg. or nom. pl. (here gen. sg.)');
    expect(wordInfo(lex, FIX_PASSAGE, 0, 2)).toMatchObject({ gloss: 'tell', parse: '3rd sg. present', here: '' });
    expect(wordInfo(lex, FIX_PASSAGE, 3, 0)).toMatchObject({ head: 'sed', parse: '' });
  });
  it('proper names carry their own gloss; enclitics are explained; unknown lemmas say so', () => {
    expect(wordInfo(lex, FIX_PASSAGE, 2, 0)).toMatchObject({ head: 'proper name', gloss: 'Marcus (a name)', parse: 'voc. sg.' });
    expect(wordInfo(lex, FIX_PASSAGE, 2, 2)).toMatchObject({ word: 'casaeque', gloss: 'hut · -que: and' });
    expect(wordInfo(buildLexicon([], []), FIX_PASSAGE, 0, 0).missing).toBe(true);
    expect(lectioText(FIX_PASSAGE.sentences[2]!)).toBe('Mārce, rīdē casaeque.');
  });
});

/* ---------------- placement and gating (fixture lexicon: sections 1–4) ---------------- */

const fake = (id: string, section: number): Lectio => ({ ...byId.get('l01-1')!, id, section });

describe('Lectiō: path placement and gating', () => {
  const lex = fixLexicon();
  const plain = buildPath(lex);
  const listen = listeningLessons()[0]!;
  const path = buildPath(lex, {
    lectio: [fake('l02-1', 2), fake('l04-1', 4), fake('l04-2', 4), fake('l08-1', 8)],
    listening: [{ ...listen, id: 'listen-x', section: 4 }],
  });

  it('without passages the path is unchanged; other nodes keep their ids and order', () => {
    expect(buildPath(lex, { lectio: [] }).nodes.map((n) => n.id)).toEqual(plain.nodes.map((n) => n.id));
    expect(path.nodes.filter((n) => n.kind !== 'lectio' && n.kind !== 'auditio').map((n) => n.id)).toEqual(plain.nodes.map((n) => n.id));
  });
  it('right after the closing Repetītiō, before Audītiō and Probātiō; absent sections get none', () => {
    const s2 = path.sections[1]!.nodes.map((n) => n.id);
    expect(s2.at(-1)).toBe('s2.lectio.l02-1');
    expect(path.sections[1]!.nodes.at(-2)!.kind).toBe('repetitio');
    expect(path.sections[3]!.nodes.map((n) => n.id).slice(-4)).toEqual(['s4.lectio.l04-1', 's4.lectio.l04-2', 's4.audit.listen-x', 's4.probatio']);
    expect(path.sections[3]!.nodes.at(-5)!.kind).toBe('repetitio');
    expect(path.nodes.filter((n) => n.kind === 'lectio').map((n) => n.lectio)).toEqual(['l02-1', 'l04-1', 'l04-2']);
    expect(path.nodes.find((n) => n.id === 's2.lectio.l02-1')!.title).toBe('Lectiō');
    expect(path.nodes.find((n) => n.id === 's4.lectio.l04-2')!.title).toBe('Lectiō II');
    const n = path.nodes.find((x) => x.id === 's4.lectio.l04-1')!;
    expect(n.newWords).toEqual([]);
    expect(n.unlocked).toEqual([...featuresAt(4, true)]);
  });
  it('gating: required in order like any node; one added behind the learner does not hold the path back', () => {
    const upTo = new Set(path.nodes.slice(0, path.index.get('s2.lectio.l02-1')!).map((x) => x.id));
    expect(path.nodes[currentNodeIndex(path, upTo)]!.id).toBe('s2.lectio.l02-1');
    expect(isUnlocked(path, upTo, 's2.lectio.l02-1')).toBe(true);
    expect(isUnlocked(path, upTo, 's3.verba.1')).toBe(false);
    // A learner who finished everything of the plain path (the passages were added later).
    const done = new Set(plain.nodes.slice(0, plain.index.get('s3.verba.1')! + 1).map((x) => x.id));
    expect(path.nodes[currentNodeIndex(path, done)]!.id).toBe(plain.nodes[plain.index.get('s3.verba.1')! + 1]!.id);
    expect(isUnlocked(path, done, 's2.lectio.l02-1')).toBe(true);
    // The skipped passage is open (no check mark), the nodes around it done, the frontier current.
    const cur = currentNodeIndex(path, done);
    expect(nodeStatus(path, done, path.index.get('s2.lectio.l02-1')!)).toBe('open');
    expect(nodeStatus(path, done, path.index.get('s3.verba.1')!)).toBe('done');
    expect(nodeStatus(path, done, cur)).toBe('current');
    expect(nodeStatus(path, done, cur + 1)).toBe('locked');
    // In normal order nothing is ever open: every node before the frontier is done.
    expect(path.nodes.map((_, i) => nodeStatus(path, upTo, i)).filter((s) => s === 'open')).toEqual([]);
  });
});

/* ---------------- lesson, grading, events ---------------- */

function lectioLesson(p: Lectio, seed = 'seed'): Exercise[] {
  const lex = fixLexicon();
  const q = { ...p, section: 4 };
  const path = buildPath(lex, { lectio: [q] });
  const node = path.nodes.find((n) => n.kind === 'lectio')!;
  return buildLesson(node, { lex, path, state: replay([]), now: new Date('2026-11-04T12:00:00Z'), unlocked: new Set(node.unlocked), seed, lectio: [q] });
}

describe('Lectiō: flow, grading, events', () => {
  for (const p of passages) {
    it(`${p.id}: context, one screen per sentence, then the questions`, () => {
      const xs = lectioLesson(p);
      expect(xs[0]).toMatchObject({ type: 'lectio', kind: 'context' });
      const reads = xs.filter((e): e is LectioScreen => e.type === 'lectio' && e.kind === 'read');
      expect(reads.map((e) => e.index)).toEqual(p.sentences.map((_, i) => i));
      const qs = xs.filter((e): e is ChoiceExercise => e.type === 'choice');
      expect(xs.length).toBe(1 + p.sentences.length + p.questions.length);
      expect(xs.slice(-qs.length)).toEqual(qs);
      qs.forEach((q, n) => {
        expect(q.kind).toBe('lectio-q');
        expect(q.card).toBe(lectioQuestionCard(p.id, n + 1));
        expect(q.prompt).toBe(p.questions[n]!.q);
        expect(q.options.find((o) => o.id === q.answer[0])!.text).toBe(p.questions[n]!.options[p.questions[n]!.answer]);
        expect(new Set(q.options.map((o) => o.text))).toEqual(new Set(p.questions[n]!.options));
      });
    });
  }

  it('questions are graded on the first attempt; a miss comes back ungraded', () => {
    const p = byId.get('l04-2')!;
    const s = new Session(lectioLesson(p));
    let missed = false;
    while (!s.done) {
      const e = s.current!.ex;
      if (e.type === 'choice') {
        const wrong = e.options.find((o) => !e.answer.includes(o.id))!.id;
        const miss = !missed && s.current!.retry === 0;
        if (miss) missed = true;
        s.answer(miss ? [wrong] : e.answer);
      }
      s.advance();
    }
    expect(s.reviews.map((r) => r.card)).toEqual(p.questions.map((_, n) => lectioQuestionCard(p.id, n + 1)));
    expect(s.reviews.map((r) => r.grade)).toEqual(['again', ...p.questions.slice(1).map(() => 'good')]);
    expect(s.graded).toBe(p.questions.length);
    expect(s.firstTryCorrect).toBe(p.questions.length - 1);
  });

  it('the same seed gives the same option order; options are shuffled across seeds', () => {
    const p = byId.get('l03-1')!;
    const order = (seed: string) => lectioLesson(p, seed).filter((e): e is ChoiceExercise => e.type === 'choice').map((e) => e.options.map((o) => o.id).join(''));
    expect(order('a')).toEqual(order('a'));
    expect(new Set(['a', 'b', 'c', 'd', 'e'].map((x) => order(x).join('|'))).size).toBeGreaterThan(1);
  });

  it('review events with lectio card ids pass the shared validator and never touch word, listening or sentence cards', () => {
    const cards = [lectioQuestionCard('l01-1', 1), lectioQuestionCard('l10-2', 4)];
    const events: VEvent[] = cards.map((card, i) => parseEvent({ id: `e${i}`, device: 'd', ts: 1_700_000_000_000 + i, kind: 'review', card, grade: i ? 'good' : 'again', body: { node: 's1.lectio.l01-1', run: 'r' } }, i));
    expect(events.map((e) => e.card)).toEqual(cards);
    for (const c of cards) {
      expect(parseCardId(c)).toBeNull();
      expect(parseListenCard(c)).toBeNull();
      expect(parseSentenceCard(c)).toBeNull();
    }
    expect(parseLectioCard(cards[1]!)).toEqual({ id: 'l10-2', question: 4 });
    expect(parseLectioCard('audit:x:q1')).toBeNull();
    const st = replay(events);
    expect(st.seen.size).toBe(0);
    expect(st.meaningGood.size).toBe(0);
    expect(st.cards.has(cards[0]!)).toBe(true);
    const done = replay([...events, parseEvent({ id: 'n', device: 'd', ts: 1_700_000_001_000, kind: 'node_done', body: { node: 's1.lectio.l01-1', run: 'r', stats: { exercises: 13, graded: 4, firstTryCorrect: 3, newWords: [], reviews: 4 } } }, 2)]);
    expect(done.done.has('s1.lectio.l01-1')).toBe(true);
  });

  it('flags and speakers: each sentence screen plays its sentence; questions have no speaker', () => {
    const p = byId.get('l02-1')!;
    const xs = lectioLesson(p);
    const read = xs.find((e): e is LectioScreen => e.type === 'lectio' && e.kind === 'read' && e.index === 3)!;
    expect(flagRef(read)).toBe('lectio:l02-1:s4');
    expect(flagShown(read)).toContain(lectioText(p.sentences[3]!));
    expect(parseEvent({ id: 'f', device: 'd', ts: 1, kind: 'flag', body: { ref: flagRef(read), reason: 'bad-latin', shown: flagShown(read) } }, 0).kind).toBe('flag');
    expect(exerciseAudio(read, fixLexicon())).toEqual({ prompt: formAudio(lectioText(p.sentences[3]!)), answer: null });
    const ctx = xs[0]!;
    expect(flagRef(ctx)).toBe('lectio:l02-1:context');
    expect(exerciseAudio(ctx, fixLexicon())).toEqual({ prompt: null, answer: null });
    const q = xs.find((e) => e.type === 'choice')!;
    expect(flagRef(q)).toBe(lectioQuestionCard('l02-1', 1));
    expect(exerciseAudio(q, fixLexicon())).toEqual({ prompt: null, answer: null });
  });
});

describe('Lectiō: audio manifest', () => {
  it('the manifest has a clip for every Lectiō sentence (the key its speaker plays)', () => {
    const texts = lectioTexts();
    expect(texts).toEqual(passages.flatMap((p) => p.sentences.map(lectioText)));
    const items = audioItems({ words: [] }, readSentenceBank(), [...EXTRA_AUDIO_TEXTS, ...listeningWordTexts(), ...texts]);
    const keys = new Set(items.map((i) => i.key));
    for (const p of passages) p.sentences.forEach((s) => expect(keys.has(formAudio(lectioText(s)).key), lectioText(s)).toBe(true));
  });
});

/* ---------------- vocabulary and grammar against the curriculum (private data) ---------------- */

const SRC = resolve(__dirname, '../content/private/wheelock.json');
const PACK = resolve(__dirname, '../content/private/vocabula-pack.json');
const present = existsSync(SRC);

describe.skipIf(!present)('Lectiō: vocabulary and grammar (private data)', () => {
  const lemmas: Lemma[] = present ? parseLemmaList(JSON.parse(readFileSync(SRC, 'utf8'))) : [];
  const lemmaById = new Map(lemmas.map((l) => [l.id, l]));

  it('every token: a Wheelock word taught by its section, a generated form, an unlocked ending (names: glossed)', () => {
    for (const p of passages) {
      p.sentences.forEach((s) => {
        for (const t of s.tokens) expect(tokenProblem(t, lemmaById, p.section), `${p.id} ${lectioText(s)}: ${t.form}`).toBeNull();
      });
    }
  });

  it('tokenProblem catches later words, wrong forms and locked endings', () => {
    expect(tokenProblem({ form: 'amīcitia', lemma: 'amicitia-n1', cell: 'nom.sg' }, lemmaById, 9)).toMatch(/ch\. 10/);
    expect(tokenProblem({ form: 'puellās', lemma: 'puella-n1', cell: 'acc.sg' }, lemmaById, 2)).toMatch(/not puellās/);
    expect(tokenProblem({ form: 'amābit', lemma: 'amo-v1', cell: 'fut.act.ind.3sg' }, lemmaById, 4)).toMatch(/locked/);
    expect(tokenProblem({ form: 'puellae', lemma: 'puella-n1', cell: 'nom.pl', attach: 'que' }, lemmaById, 5)).toMatch(/-que/);
    expect(tokenProblem({ form: 'Rōma', lemma: 'proper', cell: 'nom.sg', proper: true, gloss: 'Rome' }, lemmaById, 1)).toBeNull();
  });

  it('on the real path: each passage sits in its section, every word known there, every word glossed', () => {
    if (!existsSync(PACK)) return;
    const pack = parsePack(JSON.parse(readFileSync(PACK, 'utf8')));
    const lex = buildLexicon(pack.lemmas, dccLemmas());
    const path = buildPath(lex, { lectio: passages, listening: listeningLessons() });
    for (const p of passages) {
      const node = path.nodes.find((n) => n.lectio === p.id);
      if (!path.sections.some((x) => x.spec.n === p.section)) { expect(node).toBeUndefined(); continue; }
      expect(node!.id).toBe(`s${p.section}.lectio.${p.id}`);
      // Right after the section's closing Repetītiō (or after the passage before it).
      const prev = path.nodes[path.index.get(node!.id)! - 1]!;
      expect(prev.kind === 'repetitio' || prev.kind === 'lectio', `${p.id} after ${prev.id}`).toBe(true);
      const known = new Set(path.knownAt(node!.id));
      p.sentences.forEach((s, i) => s.tokens.forEach((t, j) => {
        if (t.proper) return;
        expect(known.has(t.lemma), `${p.id}: ${t.form} (${t.lemma}) not known at ${node!.id}`).toBe(true);
        const info = wordInfo(lex, p, i, j);
        expect(info.missing, `${p.id} ${t.form}`).toBeUndefined();
        expect(info.gloss.length).toBeGreaterThan(0);
        if (lex.byId.get(t.lemma)!.lemma.paradigm !== 'indecl') expect(info.parse, `${p.id} ${t.form}`).not.toBe('');
      }));
      const xs = buildLesson(node!, { lex, path, state: replay([]), now: new Date(), unlocked: new Set(node!.unlocked), seed: 's', lectio: passages });
      expect(xs.filter((e) => e.type === 'choice').length).toBe(p.questions.length);
    }
  });
});
