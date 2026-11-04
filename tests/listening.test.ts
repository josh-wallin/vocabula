/**
 * Audītiō lessons (content/listening/*.json, DCC recordings and texts, CC BY-SA).
 * Shape, attribution, path placement, grading and events always run (fixture lexicon);
 * the vocabulary check (every excerpt word glossed or known by the placement section,
 * through the app's analyzer and curriculum) needs the private pack and is skipped without it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { listeningLessons } from '../src/content/listening.ts';
import {
  auditQuestionCard, auditWordCard, buildAuditio, excerptText, excerptTokens, parseAuditCard, parseListeningLesson, vocabSay,
  type AuditScreen, type ListeningLesson,
} from '../src/engine/listening.ts';
import { externalAudioKey, isAudioKey } from '../src/audio/key.ts';
import { buildPath, currentNodeIndex, isUnlocked } from '../src/engine/path.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { buildLesson, isScored, type ChoiceExercise, type Exercise } from '../src/engine/lesson.ts';
import { Session } from '../src/engine/session.ts';
import { parseEvent } from '../src/engine/eventShape.ts';
import { replay, type VEvent } from '../src/engine/events.ts';
import { parseCardId } from '../src/engine/srs.ts';
import { parseListenCard } from '../src/engine/lesson.ts';
import { parseSentenceCard } from '../src/engine/sentences.ts';
import { flagRef, flagShown } from '../src/ui/Flag.tsx';
import { exerciseAudio } from '../src/audio/exercise.ts';
import { analyze } from '../src/morph/analyze.ts';
import { featureOfCell, hasFeature } from '../src/engine/curriculum.ts';
import { parsePack } from '../src/data/pack.ts';
import { dccLemmas } from '../src/data/contentStore.ts';
import { fixLexicon } from './fixtures.ts';
import { handleApi, type ApiCtx, type ApiEnv } from '../worker/api.ts';
import { FakeD1 } from './d1fake.ts';

const DIR = resolve(__dirname, '../content/listening');
const lessons = listeningLessons();
const byId = new Map(lessons.map((l) => [l.id, l]));
const LICENSE = readFileSync(resolve(DIR, 'LICENSE.md'), 'utf8');

describe('listening lessons: definitions', () => {
  it('the four lessons, one file each, named by id, at their sections', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
    expect(files).toEqual(['listen-fab2-1-3.json', 'listen-nb-01-2.json', 'listen-nb-10-3.json', 'listen-vm-07-1a.json']);
    for (const f of files) expect(parseListeningLesson(JSON.parse(readFileSync(resolve(DIR, f), 'utf8'))).id).toBe(f.replace('.json', ''));
    expect(Object.fromEntries(lessons.map((l) => [l.id, l.section]))).toEqual({
      'listen-nb-01-2': 8, 'listen-vm-07-1a': 9, 'listen-nb-10-3': 9, 'listen-fab2-1-3': 10,
    });
  });

  it('audio keys are dcc-<sha256(mp3 url)> and valid clip keys', () => {
    for (const l of lessons) {
      expect(l.audio.key).toBe(externalAudioKey(l.audio.mp3_url));
      expect(l.audio.key).toMatch(/^dcc-[0-9a-f]{24}$/);
      expect(isAudioKey(l.audio.key)).toBe(true);
      expect(l.audio.mp3_url).toMatch(/^https:\/\/dcc\.dickinson\.edu\/sites\/default\/files\/sites\/all\/files\/podcasts\/.+\.mp3$/);
    }
    // Pinned: these keys are what the vocabula-content Action stored in D1 (run 41851458256).
    expect(byId.get('listen-nb-01-2')!.audio.key).toBe('dcc-bcdb1720be123f40a899c1a3');
    expect(byId.get('listen-vm-07-1a')!.audio.key).toBe('dcc-339fa38ba3a13e62c0791d96');
    expect(byId.get('listen-nb-10-3')!.audio.key).toBe('dcc-978d2ea0b44e4cbec72c95d7');
    expect(byId.get('listen-fab2-1-3')!.audio.key).toBe('dcc-fb11d0f087c9c74f2fb8bb9c');
  });

  it('attribution: reader, DCC, record URL and CC BY-SA, in the lesson and in LICENSE.md', () => {
    for (const l of lessons) {
      const a = l.audio;
      expect(a.attribution).toContain(a.reader);
      expect(a.attribution).toContain('Dickinson College Commentaries');
      expect(a.attribution).toContain(a.record_url);
      expect(a.attribution).toContain('CC BY-SA');
      expect(a.license).toBe('CC BY-SA');
      expect(l.text_source.license).toBe('CC BY-SA');
      expect(LICENSE).toContain(a.record_url);
      expect(LICENSE).toContain(`**${a.reader}**`);
    }
    expect(new Set(lessons.map((l) => l.audio.reader))).toEqual(new Set(['Christopher Francese', 'Wanzie Li']));
    expect(LICENSE).toMatch(/Attribution-ShareAlike/);
    expect(LICENSE).not.toMatch(/Wheelock (ch|chapter)/i);
  });

  it('excerpts: every token has a known lemma or a lesson gloss, and spells the printed line', () => {
    for (const l of lessons) {
      const toks = excerptTokens(l);
      expect(toks.length, l.id).toBeGreaterThan(8);
      for (const t of toks) expect(!!t.lemma || !!t.vocab, `${l.id} ${t.w}`).toBe(true);
      expect(excerptText(l).length).toBeGreaterThan(20);
    }
    expect(excerptText(byId.get('listen-nb-01-2')!)).toBe('Erat vir magnae abstinentiae et in virtūtibus clārus, trium mīlium ferē monachōrum pater.');
    expect(excerptText(byId.get('listen-fab2-1-3')!)).toBe(
      'Est lupus, est agnus: sitit hic, sitit ille, fluentum līmite nōn ūnō quaerit uterque sitī. In summō bibit amne lupus, bibit agnus in īmō.');
  });

  it('rejects broken definitions', () => {
    const base = JSON.parse(readFileSync(resolve(DIR, 'listen-nb-01-2.json'), 'utf8')) as ListeningLesson;
    const clone = () => JSON.parse(JSON.stringify(base)) as ListeningLesson;
    const a = clone(); a.audio.key = 'dcc-000000000000000000000000';
    expect(() => parseListeningLesson(a)).toThrow(/audio.key/);
    const b = clone(); b.audio.attribution = 'Audio: DCC.';
    expect(() => parseListeningLesson(b)).toThrow(/attribution/);
    const c = clone(); delete c.transcript.find((x) => x.excerpt)!.tokens![3]!.vocab;
    expect(() => parseListeningLesson(c)).toThrow(/neither a lemma nor a vocab/);
    const d = clone(); d.transcript.find((x) => x.excerpt)!.tokens![0]!.w = 'Erant';
    expect(() => parseListeningLesson(d)).toThrow(/spell/);
    const e = clone(); e.questions[0]!.answer = 7;
    expect(() => parseListeningLesson(e)).toThrow(/answer/);
  });
});

/* ---------------- path placement (fixture lexicon: sections 1–4) ---------------- */

const fake = (id: string, section: number): ListeningLesson => ({ ...byId.get('listen-nb-01-2')!, id, section });

describe('listening lessons: path placement', () => {
  const lex = fixLexicon();
  const plain = buildPath(lex);
  const path = buildPath(lex, { listening: [fake('listen-a', 3), fake('listen-b', 4), fake('listen-c', 4), fake('listen-z', 8), ...lessons] });

  it('without lessons the path is unchanged', () => {
    expect(buildPath(lex, { listening: [] }).nodes.map((n) => n.id)).toEqual(plain.nodes.map((n) => n.id));
  });
  it('one node per lesson at the end of its section, before the Probātiō; absent sections get none', () => {
    const s3 = path.sections[2]!.nodes.map((n) => n.id);
    expect(s3.at(-1)).toBe('s3.audit.listen-a');
    expect(s3.at(-2)).toBe('s3.rep.1');
    expect(path.sections[3]!.nodes.map((n) => n.id).slice(-3)).toEqual(['s4.audit.listen-b', 's4.audit.listen-c', 's4.probatio']);
    expect(path.nodes.filter((n) => n.kind === 'auditio').map((n) => n.listening)).toEqual(['listen-a', 'listen-b', 'listen-c']);
    const n = path.nodes.find((x) => x.id === 's4.audit.listen-b')!;
    expect(n.title).toBe('Audītiō I');
    expect(path.nodes.find((x) => x.id === 's3.audit.listen-a')!.title).toBe('Audītiō');
    expect(n.newWords).toEqual([]);
    expect(n.unlocked).toEqual(path.nodes.find((x) => x.id === 's4.rep.1')!.unlocked);
    // Other nodes keep their ids and order.
    expect(path.nodes.filter((x) => x.kind !== 'auditio').map((x) => x.id)).toEqual(plain.nodes.map((x) => x.id));
  });
  it('an Audītiō node added behind the learner does not hold the path back', () => {
    const before = path.nodes.slice(0, path.index.get('s4.probatio')!).filter((x) => x.kind !== 'auditio').map((x) => x.id);
    const done = new Set(before);
    expect(path.nodes[currentNodeIndex(path, done)]!.id).toBe('s4.audit.listen-b'); // nothing after it done: it is next
    done.add('s4.probatio');
    expect(currentNodeIndex(path, done)).toBe(path.nodes.length);
    expect(isUnlocked(path, done, 's3.audit.listen-a')).toBe(true);
    // Normal order: an Audītiō node is required like any other.
    const upTo = new Set(path.nodes.slice(0, path.index.get('s3.audit.listen-a')!).map((x) => x.id));
    expect(path.nodes[currentNodeIndex(path, upTo)]!.id).toBe('s3.audit.listen-a');
  });
});

/* ---------------- lesson, grading, events ---------------- */

function auditLesson(l: ListeningLesson, seed = 'seed'): Exercise[] {
  const lex = fixLexicon();
  const path = buildPath(lex, { listening: [{ ...l, section: 4 }] });
  const node = path.nodes.find((n) => n.kind === 'auditio')!;
  return buildLesson(node, { lex, path, state: replay([]), now: new Date('2026-11-04T12:00:00Z'), unlocked: new Set(node.unlocked), seed, auditio: [{ ...l, section: 4 }] });
}

describe('listening lessons: flow and grading', () => {
  for (const l of lessons) {
    it(`${l.id}: context, pre-teach, two listens, questions`, () => {
      const xs = auditLesson(l);
      const drill = l.vocab.filter((v) => v.drill);
      const screens = xs.filter((e): e is AuditScreen => e.type === 'audit');
      expect(screens[0]!.kind).toBe('context');
      expect(screens.filter((e) => e.kind === 'word').map((e) => e.vocab!.id)).toEqual(drill.map((v) => v.id));
      const words = xs.filter((e): e is ChoiceExercise => e.type === 'choice' && e.kind === 'audit-word');
      expect(words.map((e) => e.card).sort()).toEqual(drill.map((v) => auditWordCard(l.id, v.id)).sort());
      for (const w of words) {
        // Each quiz comes after its word's card, and its answer is the word's gloss.
        expect(xs.findIndex((e) => e.type === 'audit' && e.vocab?.id === w.lemma)).toBeLessThan(xs.indexOf(w));
        expect(w.options.find((o) => o.id === w.answer[0])!.text).toBe(l.vocab.find((v) => v.id === w.lemma)!.gloss);
        expect(new Set(w.options.map((o) => o.text)).size).toBe(w.options.length);
      }
      const kinds = xs.map((e) => (e.type === 'audit' ? e.kind : e.type === 'choice' ? e.kind : e.type));
      const i1 = kinds.indexOf('listen1');
      expect(kinds.slice(i1)).toEqual(['listen1', 'listen2', ...l.questions.map(() => 'audit-q')]);
      expect(kinds.slice(0, i1).every((k) => k === 'context' || k === 'word' || k === 'audit-word')).toBe(true);
      const qs = xs.filter((e): e is ChoiceExercise => e.type === 'choice' && e.kind === 'audit-q');
      qs.forEach((q, n) => {
        expect(q.card).toBe(auditQuestionCard(l.id, n + 1));
        expect(q.prompt).toBe(l.questions[n]!.q);
        expect(q.options.find((o) => o.id === q.answer[0])!.text).toBe(l.questions[n]!.options[l.questions[n]!.answer]!);
        if (l.questions[n]!.options.join() === 'True,False') expect(q.options.map((o) => o.text)).toEqual(['True', 'False']);
      });
      expect(buildAuditio(l, 'x')).toEqual(buildAuditio(l, 'x')); // deterministic
    });
  }

  it('grades questions: right → good, wrong → again (requeued, ungraded retry)', () => {
    const l = byId.get('listen-nb-10-3')!;
    const xs = auditLesson(l);
    const s = new Session(xs);
    const reviews: { card: string; grade: string }[] = [];
    let wrongOnce = false;
    let guard = 0;
    while (!s.done && guard++ < 100) {
      const ex = s.current!.ex;
      if (!isScored(ex)) { s.advance(); continue; }
      const c = ex as ChoiceExercise;
      const miss = c.kind === 'audit-q' && !wrongOnce && s.current!.retry === 0;
      const pick = miss ? c.options.find((o) => !c.answer.includes(o.id))!.id : c.answer[0]!;
      const o = s.answer([pick]);
      if (miss) wrongOnce = true;
      if (o.grade) reviews.push({ card: o.card!, grade: o.grade });
      s.advance();
    }
    expect(s.done).toBe(true);
    const q = reviews.filter((r) => r.card.includes(':q'));
    expect(q.map((r) => r.card)).toEqual(l.questions.map((_, n) => auditQuestionCard(l.id, n + 1)));
    expect(q.map((r) => r.grade)).toEqual(['again', ...l.questions.slice(1).map(() => 'good')]);
    expect(reviews.filter((r) => r.card.includes(':w:')).every((r) => r.grade === 'good')).toBe(true);
    expect(s.graded).toBe(reviews.length);
  });

  it('review events with audit card ids pass the validator and never touch word, listening or sentence cards', () => {
    const cards = [auditQuestionCard('listen-nb-01-2', 1), auditQuestionCard('listen-fab2-1-3', 3), auditWordCard('listen-nb-01-2', 'dcc-abstinentia')];
    const events: VEvent[] = cards.map((card, i) => parseEvent({ id: `e${i}`, device: 'd', ts: 1_700_000_000_000 + i, kind: 'review', card, grade: i ? 'good' : 'again', body: { node: 's8.audit.listen-nb-01-2', run: 'r' } }, i));
    expect(events.map((e) => e.card)).toEqual(cards);
    for (const c of cards) {
      expect(c.length).toBeLessThanOrEqual(256);
      expect(parseCardId(c)).toBeNull();
      expect(parseListenCard(c)).toBeNull();
      expect(parseSentenceCard(c)).toBeNull();
    }
    expect(parseAuditCard(cards[0]!)).toEqual({ lesson: 'listen-nb-01-2', question: 1 });
    expect(parseAuditCard(cards[2]!)).toEqual({ lesson: 'listen-nb-01-2', vocab: 'dcc-abstinentia' });
    const st = replay(events);
    expect(st.seen.size).toBe(0);
    expect(st.meaningGood.size).toBe(0);
    const done = replay([...events, parseEvent({ id: 'n', device: 'd', ts: 1_700_000_001_000, kind: 'node_done', body: { node: 's8.audit.listen-nb-01-2', run: 'r', stats: { exercises: 12, graded: 7, firstTryCorrect: 6, newWords: [], reviews: 7 } } }, 3)]);
    expect(done.done.has('s8.audit.listen-nb-01-2')).toBe(true);
  });

  it('flags and speakers on Audītiō screens', () => {
    const l = byId.get('listen-vm-07-1a')!;
    const xs = auditLesson(l);
    const word = xs.find((e): e is AuditScreen => e.type === 'audit' && e.kind === 'word')!;
    expect(flagRef(word)).toBe(`audit:${l.id}:word:${word.vocab!.id}`);
    expect(flagShown(word)).toContain(word.vocab!.gloss);
    const listen = xs.find((e): e is AuditScreen => e.type === 'audit' && e.kind === 'listen1')!;
    expect(flagRef(listen)).toBe(`audit:${l.id}:listen1`);
    expect(parseEvent({ id: 'f', device: 'd', ts: 1, kind: 'flag', body: { ref: flagRef(listen), reason: 'other', shown: flagShown(listen) } }, 0).kind).toBe('flag');
    expect(exerciseAudio(word, fixLexicon()).prompt!.text).toBe(vocabSay(word.vocab!));
    expect(vocabSay({ headword: 'praeter (prep. + acc.)' })).toBe('praeter');
    const q = xs.find((e) => e.type === 'choice' && e.kind === 'audit-q')!;
    expect(exerciseAudio(q, fixLexicon())).toEqual({ prompt: null, answer: null });
  });
});

describe('worker serves dcc- keys', () => {
  const AUD = 'aud';
  const EMAIL = 'me@example.com';
  let env: ApiEnv;
  const ok: ApiCtx = { access: { aud: AUD, getIdentity: async () => ({ email: EMAIL }) } };
  const call = (path: string) => handleApi(new Request(`https://v.example${path}`), env, ok);
  const KEY = byId.get('listen-fab2-1-3')!.audio.key;
  beforeEach(async () => {
    const db = new FakeD1();
    env = { DB: db, ALLOWED_EMAILS: EMAIL, ACCESS_AUD: AUD };
    await call('/api/pack/status');
    await db.prepare('INSERT INTO audio (key, mime, bytes, text, engine, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(KEY, 'audio/mpeg', new Uint8Array([0xff, 0xf3, 1, 2]), byId.get('listen-fab2-1-3')!.audio.attribution, 'dcc', '2026-11-04T00:00:00Z').run();
  });
  it('200 for a stored dcc- clip, 404 for other prefixes', async () => {
    const r = await call(`/api/audio/${KEY}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('audio/mpeg');
    expect((await call(`/api/audio/xyz-${KEY.slice(4)}`)).status).toBe(404);
    expect((await call(`/api/audio/dcc-${'0'.repeat(24)}`)).status).toBe(404);
  });
});

/* ---------------- vocabulary against the real curriculum (private pack) ---------------- */

const PACK = resolve(__dirname, '../content/private/vocabula-pack.json');
const present = existsSync(PACK);

describe.skipIf(!present)('listening lessons: every excerpt word is glossed or known by its section (private data)', () => {
  const pack = present ? parsePack(JSON.parse(readFileSync(PACK, 'utf8'))) : null;
  // Strictest content: Wheelock + DCC, without Familia Rōmāna previews (a pack may not have them).
  const lex = pack ? buildLexicon(pack.lemmas, dccLemmas()) : null;
  const path = lex ? buildPath(lex, { listening: lessons }) : null;
  const ENCLITIC: Record<string, string> = { que: 'que-enclitic', ne: 'ne-enclitic' };

  it('each lesson is placed after its section (the pack has sections 8–10)', () => {
    for (const l of lessons) {
      if (!path!.sections.some((s) => s.spec.n === l.section)) continue;
      const n = path!.nodes.find((x) => x.listening === l.id)!;
      expect(n.id).toBe(`s${l.section}.audit.${l.id}`);
      const sec = path!.sections.find((s) => s.spec.n === l.section)!.nodes;
      const tail = sec.filter((x) => x.kind !== 'probatio').slice(-sec.filter((x) => x.kind === 'auditio').length);
      expect(tail.every((x) => x.kind === 'auditio')).toBe(true);
    }
  });

  it('known tokens: lemma known at the node, form generated in an unlocked cell; glossed tokens: not known', () => {
    for (const l of lessons) {
      const node = path!.nodes.find((x) => x.listening === l.id);
      if (!node) continue;
      const known = new Set(path!.knownAt(node.id));
      const unlocked = new Set(node.unlocked);
      const knownLemmas = [...known].map((id) => lex!.byId.get(id)!.lemma);
      for (const t of excerptTokens(l)) {
        const where = `${l.id}: ${t.w}`;
        if (t.lemma) {
          expect(known.has(t.lemma), `${where}: ${t.lemma} not taught by ${node.id}`).toBe(true);
          const w = lex!.byId.get(t.lemma)!;
          const form = t.enclitic ? t.w.slice(0, -t.enclitic.length) : t.w;
          const hits = analyze(form, [w.lemma]).filter((a) => w.lemma.paradigm === 'indecl' || a.cell === 'citation' || hasFeature(unlocked, featureOfCell(w.lemma, a.cell)!));
          expect(hits.length, `${where}: not an unlocked form of ${t.lemma}`).toBeGreaterThan(0);
          if (t.enclitic) expect(known.has(ENCLITIC[t.enclitic]!), `${where}: -${t.enclitic} not taught`).toBe(true);
        } else {
          const v = l.vocab.find((x) => x.id === t.vocab)!;
          if (v.drill) {
            const hits = analyze(t.w, knownLemmas).filter((a) => a.lemma.paradigm === 'indecl' || a.cell === 'citation' || hasFeature(unlocked, featureOfCell(a.lemma, a.cell)!));
            expect(hits.map((h) => h.lemma.id), `${where}: pre-taught but already known`).toEqual([]);
          }
        }
      }
    }
  });

  it('builds each Audītiō lesson from the real path', () => {
    for (const l of lessons) {
      const node = path!.nodes.find((x) => x.listening === l.id);
      if (!node) continue;
      const xs = buildLesson(node, { lex: lex!, path: path!, state: replay([]), now: new Date(), unlocked: new Set(node.unlocked), seed: 's', auditio: lessons });
      expect(xs.filter((e) => e.type === 'choice' && e.kind === 'audit-q').length).toBe(l.questions.length);
      for (const t of excerptTokens(l)) if (t.lemma) expect(lex!.byId.get(t.lemma)!.lemma.gloss.length, `${l.id} ${t.w}`).toBeGreaterThan(0);
    }
  });
});
