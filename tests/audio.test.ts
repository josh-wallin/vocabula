/**
 * Listening: clip keys (shared test vector with vocabula-content), eSpeak pre-processing,
 * the audio manifest, the Worker's /api/audio route, the service worker rule, and
 * listening exercises in lessons (only after a meaning review; ungraded fallback).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { AUDIO_ENGINE, audioKey, normalizeAudioText, sha256Hex, TEST_VECTOR } from '../src/audio/key.ts';
import { consonantalI, espeakInput, euHiatus } from '../src/audio/speech.ts';
import { audioItems, citationText, introAudio, sentenceAudio, wordAudio, wordText } from '../src/audio/items.ts';
import { exerciseAudio } from '../src/audio/exercise.ts';
import { COMPARE_ITEMS } from '../src/compare/items.ts';
import { audioUrl } from '../src/audio/key.ts';
const espeakUrlSync = (t: string) => audioUrl(audioKey(t));
import { fixLexicon } from './fixtures.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { buildPath } from '../src/engine/path.ts';
import { buildLesson, isListening, listenCard, parseListenCard, WORD_LISTENING_PER_LESSON, LESSON_SIZE, REVIEW_SIZE, type Exercise } from '../src/engine/lesson.ts';
import { replay, type VEvent } from '../src/engine/events.ts';
import { parseCardId } from '../src/engine/srs.ts';
import { Session } from '../src/engine/session.ts';
import { checkSentence, latinText, parseSentenceCard, parseSentences, tokenText, type Sentence, type SentenceExercise } from '../src/engine/sentences.ts';
import { parseEvent } from '../src/engine/eventShape.ts';
import { sentenceBank } from '../src/content/sentenceBank.ts';
import { handleApi, type ApiCtx, type ApiEnv } from '../worker/api.ts';
import { AUDIO_CACHE_CONTROL } from '../worker/audio.ts';
import { FakeD1 } from './d1fake.ts';
import { runtimeCaching } from '../pwa-runtime.ts';
import { parsePack } from '../src/data/pack.ts';
import { dccLemmas } from '../src/data/contentStore.ts';

describe('audio keys', () => {
  it('shared test vector (asserted in vocabula-content too)', () => {
    expect(TEST_VECTOR.input).toBe(`${AUDIO_ENGINE}|la|130|amō`);
    expect(audioKey(TEST_VECTOR.text)).toBe(TEST_VECTOR.key);
    expect(sha256Hex(TEST_VECTOR.input).slice(0, 24)).toBe(TEST_VECTOR.key);
  });
  it('sha256 matches FIPS vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it('normalizes case, spacing and Unicode form; punctuation counts', () => {
    expect(normalizeAudioText('  Puella   rosam amat. ')).toBe('puella rosam amat.');
    expect(audioKey('Amō')).toBe(audioKey('amō'));
    expect(audioKey('puella rosam amat.')).not.toBe(audioKey('puella rosam amat?'));
    expect(audioKey('amō')).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe('eSpeak pre-processing', () => {
  it('consonantal i: word-initial before a vowel, and after a prefix', () => {
    for (const [a, b] of [['iam', 'jam'], ['iūstus', 'jūstus'], ['Iūlius', 'Jūlius'], ['iubeō', 'jubeō'], ['iaceō', 'jaceō'],
      ['adiuvō', 'adjuvō'], ['coniungō', 'conjungō'], ['iniūria', 'injūria'], ['obiectus', 'objectus'], ['obiciō', 'objiciō'], ['coniunx', 'conjunx']]) {
      expect(consonantalI(a!), a).toBe(b);
    }
  });
  it('leaves vocalic i alone (iit, iēns, ii, intervocalic i that eSpeak already doubles)', () => {
    for (const w of ['iit', 'iēns', 'iī', 'obiit', 'adiit', 'cuius', 'huius', 'maior', 'eius', 'initium', 'inimīcus', 'Ītalia', 'reī', 'patria']) {
      expect(consonantalI(w), w).toBe(w);
    }
  });
  it('eu is a hiatus except in real diphthongs', () => {
    expect(euHiatus('deus')).toBe('deüs');
    expect(euHiatus('meum')).toBe('meüm');
    expect(euHiatus('eunt')).toBe('eünt');
    for (const w of ['heu', 'seu', 'neuter', 'neutrum', 'ceu']) expect(euHiatus(w), w).toBe(w);
  });
  it('whole texts: hyphens dropped, macrons and punctuation kept', () => {
    expect(espeakInput('-que')).toBe('que');
    expect(espeakInput('iam deus adest.')).toBe('jam deüs adest.');
    expect(espeakInput('Ō puerī, valēte!')).toBe('Ō puerī, valēte!');
  });
});

/* ---------------- manifest ---------------- */

const lex = fixLexicon();
const W = (first: string) => lex.words.find((w) => w.lemma.parts[0] === first)!.lemma;
const tok = (form: string, lemma: string, cell: string, role?: string) => ({ form, lemma, cell, ...(role ? { role } : {}) });
const BANK: Sentence[] = parseSentences([
  { id: 'a-01', section: 2, en: ['The star shines.', 'A star shines.'], tokens: [tok('stella', W('stella').id, 'nom.sg', 'subj'), tok('lūcet', W('lūceō').id, 'pres.act.ind.3sg', 'verb')] },
  { id: 'a-02', section: 2, en: ['The moon shines.'], tokens: [tok('lūna', W('lūna').id, 'nom.sg', 'subj'), tok('lūcet', W('lūceō').id, 'pres.act.ind.3sg', 'verb')] },
  { id: 'a-03', section: 2, en: ['The inhabitant {tells|is telling} [the] stories.'], tokens: [tok('incola', W('incola').id, 'nom.sg', 'subj'), tok('nunc', W('nunc').id, 'citation'), tok('nārrat', W('nārrō').id, 'pres.act.ind.3sg', 'verb')] },
]);

describe('audio manifest', () => {
  const items = audioItems(lex, BANK);
  const keys = new Set(items.map((i) => i.key));
  it('every lemma, every citation, every sentence and every written form gets a clip', () => {
    for (const w of lex.words) {
      expect(keys.has(wordAudio(w.lemma).key), w.lemma.id).toBe(true);
      expect(keys.has(introAudio(w.lemma).key), w.lemma.id).toBe(true);
    }
    for (const s of BANK) {
      expect(keys.has(sentenceAudio(s).key), s.id).toBe(true);
      for (const t of s.tokens) expect(keys.has(audioKey(tokenText(t))), t.form).toBe(true);
    }
    expect(items.length).toBe(keys.size); // de-duplicated
    expect(items.find((i) => i.key === audioKey('lūcet'))!.kind).toBe('form');
  });
  it('texts: first form, the citation (rosa, rosae), the printed sentence', () => {
    expect(wordText(W('casa'))).toBe('casa');
    expect(citationText(W('casa'))).toBe('casa, casae');
    expect(citationText(W('nunc'))).toBeNull();
    expect(introAudio(W('nunc')).key).toBe(wordAudio(W('nunc')).key);
    expect(sentenceAudio(BANK[0]!).text).toBe(normalizeAudioText(latinText(BANK[0]!)));
    expect(items.find((i) => i.text === 'iam')?.speak ?? 'jam').toBe('jam');
  });
  it('includes the voice-test items (eSpeak column of #/compare)', () => {
    const ks = new Set(audioItems({ words: [] }, []).map((i) => i.key));
    for (const it of COMPARE_ITEMS) expect(ks.has(audioKey(it.la)), it.id).toBe(true);
    expect(espeakUrlSync(COMPARE_ITEMS[0]!.la)).toBe(`/api/audio/${audioKey(COMPARE_ITEMS[0]!.la)}`);
  });
  it('covers the real sentence bank', () => {
    const bank = sentenceBank();
    const all = new Set(audioItems({ words: [] }, bank).map((i) => i.key));
    for (const s of bank) {
      expect(all.has(sentenceAudio(s).key), s.id).toBe(true);
      for (const t of s.tokens) expect(all.has(audioKey(tokenText(t))), `${s.id} ${t.form}`).toBe(true);
    }
  });
  const PACK = resolve(__dirname, '../content/private/vocabula-pack.json');
  it.skipIf(!existsSync(PACK))('covers every word of the private pack (Wheelock, DCC, FR) and every bank sentence', () => {
    const pack = parsePack(JSON.parse(readFileSync(PACK, 'utf8')));
    const full = buildLexicon(pack.lemmas, dccLemmas(), pack.fr ?? []);
    const its = audioItems(full, sentenceBank());
    const ks = new Set(its.map((i) => i.key));
    for (const w of full.words) expect(ks.has(wordAudio(w.lemma).key) && ks.has(introAudio(w.lemma).key), w.lemma.id).toBe(true);
    for (const s of sentenceBank()) expect(ks.has(sentenceAudio(s).key), s.id).toBe(true);
    // Every exercise's speaker refers to a manifest clip except form drills (parse / produce), which may 404.
    expect(its.every((i) => i.speak.length > 0)).toBe(true);
  });
});

/* ---------------- Worker route ---------------- */

describe('worker: GET /api/audio/:key', () => {
  const AUD = 'aud';
  const EMAIL = 'me@example.com';
  let db: FakeD1;
  let env: ApiEnv;
  const ok: ApiCtx = { access: { aud: AUD, getIdentity: async () => ({ email: EMAIL }) } };
  const call = (path: string, ctx: ApiCtx | undefined = ok, init: RequestInit = {}) => handleApi(new Request(`https://v.example${path}`, init), env, ctx);
  const KEY = audioKey('amō');
  const BYTES = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3, 0xff, 0]);
  beforeEach(async () => {
    db = new FakeD1();
    env = { DB: db, ALLOWED_EMAILS: EMAIL, ACCESS_AUD: AUD };
    await call('/api/pack/status'); // creates the tables
    await db.prepare('INSERT INTO audio (key, mime, bytes, text, engine, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(KEY, 'audio/mpeg', BYTES, 'amō', AUDIO_ENGINE, '2026-11-04T00:00:00Z').run();
  });
  it('403 without an allowed identity', async () => {
    expect((await call(`/api/audio/${KEY}`, {})).status).toBe(403);
    expect((await call(`/api/audio/${KEY}`, { access: { aud: AUD, getIdentity: async () => ({ email: 'x@y.z' }) } })).status).toBe(403);
  });
  it('200 with the bytes, type and immutable private caching', async () => {
    const r = await call(`/api/audio/${KEY}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('audio/mpeg');
    expect(r.headers.get('cache-control')).toBe(AUDIO_CACHE_CONTROL);
    expect(AUDIO_CACHE_CONTROL).toBe('private, max-age=31536000, immutable');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(BYTES);
    const again = await call(`/api/audio/${KEY}`, ok, { headers: { 'if-none-match': `"${KEY}"` } });
    expect(again.status).toBe(304);
  });
  it('404 for a missing or malformed key; 405 for other methods', async () => {
    expect((await call(`/api/audio/${audioKey('nescio')}`)).status).toBe(404);
    expect((await call('/api/audio/not-a-key')).status).toBe(404);
    expect((await call('/api/audio/')).status).toBe(404);
    expect((await call(`/api/audio/${KEY}`, ok, { method: 'POST', body: 'x' })).status).toBe(405);
  });
});

describe('service worker', () => {
  const rule = (path: string) => runtimeCaching.find((r) => typeof r.urlPattern === 'function'
    ? (r.urlPattern as (o: { url: URL }) => boolean)({ url: new URL(`https://v.example${path}`) })
    : (r.urlPattern as RegExp).test(`https://v.example${path}`));
  it('caches /api/audio/* first (cache "audio", ~5000 entries); the rest of /api stays network-only', () => {
    const a = rule('/api/audio/0123456789abcdef01234567')!;
    expect(a.handler).toBe('CacheFirst');
    expect(a.options?.cacheName).toBe('audio');
    expect(a.options?.expiration?.maxEntries).toBe(5000);
    expect(a.options?.cacheableResponse).toEqual({ statuses: [200], headers: { 'content-type': 'audio/mpeg' } });
    expect(rule('/api/events')!.handler).toBe('NetworkOnly');
    expect(rule('/api/pack')!.handler).toBe('NetworkOnly');
  });
});

/* ---------------- lessons ---------------- */

const path = buildPath(lex);
const node = (id: string) => path.nodes.find((n) => n.id === id)!;
const T0 = Date.parse('2026-11-03T10:00:00Z');
function eventsUpTo(upTo: string, grade: 'good' | 'again' = 'good'): VEvent[] {
  const events: VEvent[] = [];
  let ts = T0;
  for (const n of path.nodes) {
    if (n.id === upTo) break;
    for (const w of n.newWords) events.push({ id: `r-${n.id}-${w}`, device: 'd', ts: ts++, kind: 'review', card: `${w}:meaning`, grade });
    events.push({ id: `n-${n.id}`, device: 'd', ts: ts++, kind: 'node_done', body: { node: n.id, run: n.id, stats: { exercises: 0, graded: 0, firstTryCorrect: 0, newWords: n.newWords, reviews: 0 } } });
  }
  return events;
}
const all = { available: () => true };
function lesson(id: string, o: { listening?: { available: (k: string) => boolean }; events?: VEvent[]; seed?: string } = {}): Exercise[] {
  const n = node(id);
  return buildLesson(n, {
    lex, path, state: replay(o.events ?? eventsUpTo(id)), now: new Date(T0 + 86400000 * 5), unlocked: new Set(n.unlocked),
    seed: o.seed ?? 'seed', sentences: BANK, ...(o.listening ? { listening: o.listening } : {}),
  });
}
const listening = (ex: Exercise[]) => ex.filter(isListening);
const reps = path.nodes.filter((n) => n.kind === 'repetitio');
const rep2 = reps.find((n) => n.section >= 2)!.id;
const verba = path.nodes.filter((n) => n.kind === 'verba' && n.section >= 2)[0]!.id;

describe('listening in lessons', () => {
  it('without ctx.listening the lessons are exactly as before', () => {
    for (const n of path.nodes) {
      expect(JSON.stringify(lesson(n.id, { listening: { available: () => false } })), n.id).toBe(JSON.stringify(lesson(n.id)));
    }
  });
  it('Repetītiō: 2 word listening exercises + sentence listening, same length; only on words with a correct meaning review', () => {
    const ex = lesson(rep2, { listening: all });
    expect(ex.length).toBe(REVIEW_SIZE);
    const words = listening(ex).filter((e) => e.type !== 'sentence');
    expect(words.length).toBe(WORD_LISTENING_PER_LESSON);
    const st = replay(eventsUpTo(rep2));
    for (const e of words) expect(st.meaningGood.get((e as { lemma: string }).lemma) ?? 0).toBeGreaterThanOrEqual(1);
    expect(words.every((e) => e.kind === 'listen')).toBe(true); // dictation only after a hear → meaning review
    expect(listening(ex).some((e) => e.type === 'sentence')).toBe(true);
    // A listened word isn't also quizzed in the same lesson.
    const lemmas = new Set(words.map((e) => (e as { lemma: string }).lemma));
    expect(ex.filter((e) => !isListening(e) && 'lemma' in e && lemmas.has(e.lemma))).toEqual([]);
  });
  it('no listening for words never answered right, or whose clip is unavailable', () => {
    expect(listening(lesson(rep2, { listening: all, events: eventsUpTo(rep2, 'again') })).filter((e) => e.type !== 'sentence')).toEqual([]);
    const casa = wordAudio(W('casa')).key;
    const some = lesson(rep2, { listening: { available: (k) => k !== casa } });
    expect(listening(some).some((e) => 'lemma' in e && e.lemma === W('casa').id)).toBe(false);
  });
  it('dictation once the word has a hear → meaning review', () => {
    const ev = eventsUpTo(rep2);
    const known = [...new Set(ev.filter((e) => e.card?.endsWith(':meaning')).map((e) => parseCardId(e.card!)!.lemma))];
    const extra = known.map((l, i): VEvent => ({ id: `l-${i}`, device: 'd', ts: T0 + 86400000 * 5 - 60_000 + i, kind: 'review', card: listenCard(l, 'listen'), grade: 'good' }));
    const ex = listening(lesson(rep2, { listening: all, events: [...ev, ...extra] })).filter((e) => e.type !== 'sentence');
    expect(ex.some((e) => e.kind === 'dictate')).toBe(true);
    const d = ex.find((e) => e.kind === 'dictate')!;
    expect(d.type).toBe('typed');
    expect(d.card).toMatch(/:dictate$/);
  });
  it('Verba: listening on earlier words only, never this lesson’s new words', () => {
    const n = node(verba);
    const ex = lesson(verba, { listening: all });
    const l = listening(ex);
    expect(l.length).toBeGreaterThan(0);
    expect(l.length).toBeLessThanOrEqual(WORD_LISTENING_PER_LESSON);
    for (const e of l) expect(n.newWords).not.toContain((e as { lemma: string }).lemma);
    expect(ex.length).toBeLessThanOrEqual(Math.max(LESSON_SIZE, 2 * n.newWords.length + WORD_LISTENING_PER_LESSON));
    // Pattern / Fōrmae lessons never get listening.
    for (const p of path.nodes.filter((x) => x.kind === 'pattern' || x.kind === 'formae')) expect(listening(lesson(p.id, { listening: all }))).toEqual([]);
  });
  it('deterministic for a seed', () => {
    expect(JSON.stringify(lesson(rep2, { listening: all, seed: 'x' }))).toBe(JSON.stringify(lesson(rep2, { listening: all, seed: 'x' })));
  });
});

describe('listening exercises: grading, cards and fallback', () => {
  const ex = lesson(rep2, { listening: all });
  it('card ids are accepted by the event validator and ignored by the word / sentence card parsers', () => {
    expect(parseListenCard('casa-n1:listen')).toEqual({ lemma: 'casa-n1', kind: 'listen' });
    expect(parseListenCard('sent:a-01:listen')).toBeNull();
    expect(parseCardId('casa-n1:listen')).toBeNull();
    expect(parseSentenceCard('sent:a-01:dictate')).toBeNull();
    for (const card of ['casa-n1:listen', 'casa-n1:dictate', 'sent:a-01:listen', 'sent:a-01:dictate']) {
      expect(parseEvent({ id: 'e', device: 'd', ts: 1, kind: 'review', card, grade: 'good' }, 0).card).toBe(card);
    }
  });
  it('hear → meaning is graded as {lemma}:listen; the cue is the word', () => {
    const e = listening(ex).find((x) => x.kind === 'listen' && x.type === 'choice')!;
    const s = new Session([e]);
    const o = s.answer((e as { answer: string[] }).answer);
    expect(o.ok).toBe(true);
    expect(o.card).toBe(listenCard((e as { lemma: string }).lemma, 'listen'));
    expect(e.audio.key).toBe(wordAudio(lex.byId.get((e as { lemma: string }).lemma)!.lemma).key);
  });
  it('dictation accepts a missing macron (with a reminder)', () => {
    const lemma = W('lūna');
    const ev = [...eventsUpTo(rep2), { id: 'x', device: 'd', ts: T0 + 86400000 * 5 - 60_000, kind: 'review', card: listenCard(lemma.id, 'listen'), grade: 'good' } as VEvent];
    const all2 = buildLesson(node(rep2), { lex, path, state: replay(ev), now: new Date(T0 + 86400000 * 5), unlocked: new Set(node(rep2).unlocked), seed: 'seed', listening: { available: (k) => k === wordAudio(lemma).key } });
    const d = all2.find((e) => isListening(e) && e.kind === 'dictate')!;
    expect(d).toBeTruthy();
    const o = new Session([d]).answer('luna');
    expect(o.ok).toBe(true);
    expect(o.macronMiss).toBe(true);
    expect(o.expected).toBe('lūna');
  });
  it('sentence dictation needs the heard order; hear → English accepts any accepted translation', () => {
    const s = BANK[0]!;
    const mk = (kind: 'dictate' | 'listen'): SentenceExercise => {
      const e = listening(lesson(rep2, { listening: { available: (k) => k === sentenceAudio(s).key }, seed: kind })).find((x) => x.type === 'sentence') as SentenceExercise;
      return e;
    };
    const heard = mk('listen');
    expect(heard.kind).toBe('listen');
    expect(heard.card).toBe('sent:a-01:listen');
    const words = (t: string) => t.split(' ').map((w) => heard.options.find((o) => o.text === w)!.id);
    expect(checkSentence(heard, words('the star shines')).ok).toBe(true);
    // Dictation built directly (needs a prior listen review in a lesson).
    const ev = [...eventsUpTo(rep2), { id: 'y', device: 'd', ts: T0 + 86400000 * 5 - 60_000, kind: 'review', card: 'sent:a-01:listen', grade: 'good' } as VEvent];
    const d = buildLesson(node(rep2), { lex, path, state: replay(ev), now: new Date(T0 + 86400000 * 5), unlocked: new Set(node(rep2).unlocked), seed: 'seed', sentences: BANK, listening: { available: (k) => k === sentenceAudio(s).key } })
      .find((x) => isListening(x) && x.type === 'sentence') as SentenceExercise;
    expect(d.kind).toBe('dictate');
    const ids = (t: string) => t.split(' ').map((w) => d.options.find((o) => o.text === w)!.id);
    expect(checkSentence(d, ids('stella lūcet')).ok).toBe(true);
    expect(checkSentence(d, ids('lūcet stella')).ok).toBe(false); // a fine Latin order, but not what was heard
    expect(d.fallback?.kind).toBe('la');
  });
  it('a clip that fails swaps in the fallback, ungraded; only the fallback is graded', () => {
    const e = listening(ex)[0]!;
    const s = new Session([e]);
    s.swapCurrent(e.fallback);
    expect(s.current!.ex).toBe(e.fallback);
    const fb = e.fallback as { answer?: string[]; card: string };
    const o = s.answer(fb.answer ?? []);
    expect(o.card).toBe(fb.card);
    expect(s.reviews.map((r) => r.card)).toEqual([fb.card]);
    expect(isListening(e.fallback)).toBe(false);
  });
});

describe('speaker audio per exercise', () => {
  const ex = lesson(rep2, { listening: all });
  it('before answering: never reveals the answer; after: the word or sentence', () => {
    for (const e of ex) {
      const a = exerciseAudio(e, lex);
      if (e.type === 'typed' && (e.kind === 'recall' || e.kind === 'produce')) expect(a.prompt, e.kind).toBeNull();
      if (e.type === 'sentence' && (e.kind === 'cloze' || e.kind === 'la' || e.kind === 'dictate' || e.kind === 'listen')) expect(a.prompt, e.kind).toBeNull();
      if (e.type === 'sentence') expect(a.answer?.key).toBe(sentenceAudio(e.s).key);
      if (e.type === 'choice' && e.kind === 'meaning') expect(a.prompt?.key).toBe(introAudio(lex.byId.get(e.lemma)!.lemma).key);
      if (isListening(e)) expect(a.prompt).toBeNull();
    }
  });
});
