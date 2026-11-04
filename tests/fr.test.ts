/**
 * Familia Rōmāna previews: pack field, import, lexicon merge, path placement, meaning-only lessons.
 * All fixtures are invented here (common Latin words; chapters and glosses made up), no FR text.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { FIX_DCC, FIX_DCC_58, FIX_DCC_910, FIX_WHEELOCK, FIX_WHEELOCK_58, FIX_WHEELOCK_910, fixPath } from './fixtures.ts';
import { importFr, cleanFrHeadword, expandFrHeadword, FR_PLACEMENT, frSection, type FrEntry, type FrSourceEntry } from '../src/data/fr.ts';
import { makePack, packHash, parsePack } from '../src/data/pack.ts';
import { buildLexicon, type Lexicon } from '../src/engine/lexicon.ts';
import { buildPath, FR_LESSON_SIZE, type Path, type PathNode } from '../src/engine/path.ts';
import { buildLesson, formsLocked, isGraded, LESSON_SIZE, MIN_MEANING_FOR_RECALL, reviewCardIds, type Exercise } from '../src/engine/lesson.ts';
import { replay, stateFingerprint, type VEvent } from '../src/engine/events.ts';
import { featuresAt } from '../src/engine/curriculum.ts';
import { parseCardId } from '../src/engine/srs.ts';
import { rng, shuffle } from '../src/engine/util.ts';
import { handleApi, type ApiEnv } from '../worker/api.ts';
import { FakeD1 } from './d1fake.ts';

const S = (o: Partial<FrSourceEntry> & Pick<FrSourceEntry, 'headword' | 'pos' | 'chapter'>): FrSourceEntry => ({
  lemma: o.headword.split(',')[0]!, gloss: `invented gloss for ${o.headword.split(',')[0]}`, inWheelock: null, inDcc: null, ...o,
});

/** Invented FR-style list. */
const FR_SOURCE: FrSourceEntry[] = [
  S({ headword: 'Mārcus', pos: 'proper', properKind: 'character', chapter: 1 }),
  S({ headword: 'Ītalia, -ae, f.', pos: 'proper', properKind: 'place', chapter: 1 }),
  S({ headword: 'capra, -ae, f.', pos: 'noun', gender: 'f', chapter: 1 }),                                       // FR-only
  S({ headword: 'stella, -ae, f.', pos: 'noun', gender: 'f', chapter: 1, inWheelock: 2, wheelockHeadword: 'stella, stellae, f.' }), // Wheelock later
  S({ headword: 'ambulō, -āre, -āvī, -ātum', pos: 'verb', chapter: 1, inWheelock: 1, wheelockHeadword: 'ambulō, ambulāre' }), // taught already
  S({ headword: 'cum + abl.', pos: 'prep', chapter: 1 }),
  S({ headword: 'ego, meī', pos: 'pron', chapter: 1 }),
  S({ headword: 'aqua, -ae, f.', pos: 'noun', gender: 'f', chapter: 1, inDcc: 4 }),                              // DCC, Plūra verba in s2
  S({ headword: 'ā / ab + abl.', pos: 'prep', chapter: 1 }),
  S({ headword: 'hīc', pos: 'adv', chapter: 2 }),
  S({ headword: 'hic, haec, hoc', pos: 'pron', chapter: 2 }),
  S({ headword: 'parō, -āre', pos: 'verb', chapter: 2, inDcc: 3 }),                                              // DCC, already in s1
  S({ headword: 'lupus, -ī, m.', pos: 'noun', gender: 'm', chapter: 2, inWheelock: 3, wheelockHeadword: 'lupus, lupī, m.' }),
  S({ headword: 'capra, -ae, f.', pos: 'noun', gender: 'f', chapter: 3 }),                                       // duplicate
  ...['āla', 'būra', 'cūna', 'dola', 'fera', 'gula', 'mora', 'nola'].map((w) =>
    S({ headword: `${w}, -ae, f.`, pos: 'noun', gender: 'f', chapter: 3 })),                                     // 8 → two lessons
  S({ headword: 'corvus, -ī, m.', pos: 'noun', gender: 'm', chapter: 6 }),                                       // section 6 only with ch. 5–8
];

const imported = () => importFr(FR_SOURCE, [...FIX_WHEELOCK, ...FIX_WHEELOCK_58]);
const FR = imported().entries;
const lexWith = (fr: readonly FrEntry[] = FR, w58 = false): Lexicon =>
  buildLexicon(w58 ? [...FIX_WHEELOCK, ...FIX_WHEELOCK_58] : FIX_WHEELOCK, w58 ? [...FIX_DCC, ...FIX_DCC_58] : FIX_DCC, fr);

describe('FR import', () => {
  const r = imported();
  const ids = r.entries.map((e) => e.lemma.id);

  it('drops proper names, words Wheelock already taught and duplicates', () => {
    expect(r.excluded.map((x) => x.entry.headword)).toEqual(expect.arrayContaining(['Mārcus', 'Ītalia, -ae, f.', 'ambulō, -āre, -āvī, -ātum', 'capra, -ae, f.']));
    expect(ids).not.toContain('ambulo-v1');
    expect(ids.filter((x) => x === 'capra-n1')).toHaveLength(1);
    expect(r.entries.find((e) => e.lemma.id === 'capra-n1')!.chapter).toBe(1);
  });

  it('keeps a word Wheelock teaches later, under the Wheelock lemma id', () => {
    const stella = r.entries.find((e) => e.lemma.id === 'stella-n1')!;
    expect(stella.wheelockChapter).toBe(2);
    expect(FIX_WHEELOCK.some((l) => l.id === stella.lemma.id)).toBe(true);
    expect(ids).toContain('lupus-n2m');
  });

  it('spells out abbreviated headwords and tidies case notes', () => {
    expect(expandFrHeadword('capra, -ae, f.', 'noun')).toBe('capra, caprae, f.');
    expect(expandFrHeadword('corvus, -ī, m.', 'noun')).toBe('corvus, corvī, m.');
    expect(expandFrHeadword('parō, -āre', 'verb')).toBe('parō, parāre');
    expect(cleanFrHeadword('cum + abl.')).toEqual({ main: 'cum' });
    expect(cleanFrHeadword('ā / ab + abl.')).toEqual({ main: 'ā', alt: 'ab' });
    expect(ids).toEqual(expect.arrayContaining(['capra-n1', 'corvus-n2m', 'cum-indecl', 'a-indecl', 'paro-v1', 'aqua-n1']));
    expect(r.entries.find((e) => e.lemma.id === 'a-indecl')!.lemma.headword).toBe('ā (or ab)');
  });

  it('gives declinable words without a paradigm a provisional id that cannot collide', () => {
    expect(ids).toEqual(expect.arrayContaining(['ego-fr-pron', 'hic-indecl']));
    expect(r.fallback.map((f) => f.entry.headword)).toEqual(expect.arrayContaining(['ego, meī']));
  });

  it('the demonstrative hic now has a paradigm, so it gets the real id (shared with Wheelock ch. 9 / DCC)', () => {
    expect(ids).toContain('hic-pron-hic');
    expect(ids).not.toContain('hic-fr-pron');
    expect(r.fallback.map((f) => f.entry.headword)).not.toContain('hic, haec, hoc');
  });

  it('carries only forms and the gloss (no FR notes, no sources)', () => {
    for (const e of r.entries) {
      expect(e.lemma.notes).toBeUndefined();
      expect(e.lemma.sources).toEqual([]);
      expect(Object.keys(e).sort()).toEqual(expect.arrayContaining(['chapter', 'lemma', 'order']));
    }
  });
});

describe('FR pack field', () => {
  const plain = () => JSON.parse(JSON.stringify(makePack(FIX_WHEELOCK, [1, 2, 3, 4], new Date('2026-11-01T00:00:00Z'))));
  const withFr = () => JSON.parse(JSON.stringify(makePack(FIX_WHEELOCK, [1, 2, 3, 4], new Date('2026-11-01T00:00:00Z'), FR)));

  it('a pack without fr still validates, unchanged', () => {
    const p = parsePack(plain());
    expect(p.fr).toBeUndefined();
    expect(p.counts.fr).toBeUndefined();
    expect(p.id).toBe('wheelock-ch1-4');
  });

  it('a pack with fr validates and counts FR words per chapter', () => {
    const p = parsePack(withFr());
    expect(p.fr).toHaveLength(FR.length);
    expect(p.counts.fr!['1']).toBe(FR.filter((e) => e.chapter === 1).length);
    expect(p.counts.lemmas).toBe(FIX_WHEELOCK.length);
    expect(p.id).toBe('wheelock-ch1-4+fr-cap1-6');
  });

  it('rejects malformed fr data', () => {
    const p = withFr();
    expect(() => parsePack({ ...p, fr: {} })).toThrow(/fr/);
    expect(() => parsePack({ ...p, fr: [{ ...p.fr[0], lemma: { id: 'x' } }, ...p.fr.slice(1)] })).toThrow(/Invalid lemma/);
    expect(() => parsePack({ ...p, fr: [{ ...p.fr[0], chapter: 0 }, ...p.fr.slice(1)] })).toThrow(/chapter/);
    expect(() => parsePack({ ...p, fr: [...p.fr, p.fr[0]] })).toThrow(/twice|mismatch/);
    expect(() => parsePack({ ...p, fr: p.fr.slice(1) })).toThrow(/Familia Rōmāna chapter/);
    const { fr: _fr, ...noFr } = p;
    expect(() => parsePack(noFr)).toThrow(/contains none/);
  });

  it('the Worker accepts and serves a pack with fr (same validator)', async () => {
    const env: ApiEnv = { DB: new FakeD1(), ALLOWED_EMAILS: 'me@example.com', ACCESS_AUD: 'aud' };
    const ctx = { access: { aud: 'aud', getIdentity: async () => ({ email: 'me@example.com' }) } };
    const p = makePack(FIX_WHEELOCK, [1, 2, 3, 4], new Date('2026-11-01T00:00:00Z'), FR);
    const put = await handleApi(new Request('https://x.example/api/pack', { method: 'PUT', body: JSON.stringify(p) }), env, ctx);
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ hash: await packHash(p) });
    const get = await handleApi(new Request('https://x.example/api/pack'), env, ctx);
    expect(parsePack(await get.json()).fr).toHaveLength(FR.length);
  });
});

describe('FR lexicon merge', () => {
  const lex = lexWith();
  it('a previewed Wheelock or DCC word shares its Word (and so its card ids)', () => {
    const stella = lex.byId.get('stella-n1')!;
    expect(stella.origin).toBe('wheelock');
    expect(stella.fr).toEqual({ chapter: 1, order: expect.any(Number) });
    expect(stella.lemma.gloss).toBe('star'); // Wheelock's gloss wins, as for magnus
    expect(lex.byId.get('aqua-n1')!.origin).toBe('dcc');
    expect(lex.words.filter((w) => w.lemma.id === 'stella-n1')).toHaveLength(1);
  });
  it('FR-only words get origin fr and stay out of the DCC list', () => {
    expect(lex.byId.get('capra-n1')!.origin).toBe('fr');
    expect(lex.frOnly.map((w) => w.lemma.id)).toContain('capra-n1');
    expect(lex.dccOnly.some((w) => w.origin === 'fr')).toBe(false);
  });
  it('no fr entries → the same lexicon as before', () => {
    expect(buildLexicon(FIX_WHEELOCK, FIX_DCC).words.map((w) => w.lemma.id))
      .toEqual(lexWith([]).words.map((w) => w.lemma.id));
  });
});

describe('FR path placement', () => {
  const lex = lexWith();
  const path = buildPath(lex);
  const sec = (p: Path, n: number) => p.sections.find((s) => s.spec.n === n)!.nodes;

  it('without fr the path is unchanged', () => {
    const p = buildPath(lexWith([]));
    expect(p.nodes.map((n) => n.id)).toEqual(fixPath().nodes.map((n) => n.id));
  });

  it('places "Familia Rōmāna · Cap. N" after section N, before the Probātiō', () => {
    const s1 = sec(path, 1);
    const i = s1.findIndex((n) => n.kind === 'fr');
    expect(i).toBeGreaterThan(0);
    expect(s1[i - 1]!.kind).toBe('repetitio');
    expect(s1.slice(i).every((n) => n.kind === 'fr' || n.kind === 'repetitio')).toBe(true);
    expect(s1[i]!.title).toBe('Familia Rōmāna · Cap. I');
    expect(s1[i]!.id).toBe('s1.fr.1');
    const s4 = sec(path, 4);
    expect(s4[s4.length - 1]!.kind).toBe('probatio');
    // Every non-FR node keeps its id and order.
    expect(path.nodes.filter((n) => n.kind !== 'fr' && !/\.rep\.\d+$/.test(n.id)).map((n) => n.id))
      .toEqual(fixPath().nodes.filter((n) => !/\.rep\.\d+$/.test(n.id)).map((n) => n.id));
  });

  it('splits a long chapter into ≤6-word lessons with "Pars" titles', () => {
    const fr3 = sec(path, 3).filter((n) => n.kind === 'fr');
    expect(fr3.map((n) => n.title)).toEqual(['Familia Rōmāna · Cap. III · Pars I', 'Familia Rōmāna · Cap. III · Pars II']);
    for (const n of fr3) expect(n.newWords.length).toBeLessThanOrEqual(FR_LESSON_SIZE);
    expect(fr3.flatMap((n) => n.newWords)).toHaveLength(8);
  });

  it('keeps words the main path teaches later, drops those it already taught', () => {
    const fr1 = sec(path, 1).filter((n) => n.kind === 'fr').flatMap((n) => n.newWords);
    expect(fr1).toEqual(expect.arrayContaining(['capra-n1', 'stella-n1', 'aqua-n1', 'cum-indecl', 'ego-fr-pron']));
    const fr2 = sec(path, 2).filter((n) => n.kind === 'fr').flatMap((n) => n.newWords);
    expect(fr2).toContain('lupus-n2m');
    expect(fr2).not.toContain('paro-v1'); // Plūra verba in section 1
    // stella is still taught by its Wheelock Verba node, under the same id
    expect(sec(path, 2).filter((n) => n.kind === 'verba').flatMap((n) => n.newWords)).toContain('stella-n1');
    expect(path.mainIndex.get('stella-n1')).toBeGreaterThan(path.index.get('s1.fr.1')!);
  });

  it('no FR node for a section the path does not have', () => {
    expect(path.sections.map((s) => s.spec.n)).toEqual([1, 2, 3, 4]);
    expect(path.nodes.some((n) => n.newWords.includes('corvus-n2m'))).toBe(false);
    const p58 = buildPath(lexWith(FR, true));
    const s6 = sec(p58, 6).filter((n) => n.kind === 'fr');
    expect(s6.map((n) => n.title)).toEqual(['Familia Rōmāna · Cap. VI']);
    expect(s6[0]!.newWords).toEqual(['corvus-n2m']);
    expect(sec(p58, 5).some((n) => n.kind === 'fr')).toBe(false); // no FR ch. 5 words
  });
});

describe('FR lessons: meaning only', () => {
  const lex = lexWith();
  const path = buildPath(lex);
  const T0 = Date.parse('2026-11-03T10:00:00Z');
  const node = (id: string) => path.nodes.find((n) => n.id === id)!;

  /** Finish every node before `upTo` with `good` meaning reviews (twice, so recall opens). */
  function stateAfter(upTo: string | null, extra: VEvent[] = []) {
    const events: VEvent[] = [];
    let ts = T0;
    for (const n of path.nodes) {
      if (n.id === upTo) break;
      for (const w of n.newWords) for (let k = 0; k < MIN_MEANING_FOR_RECALL; k++) {
        events.push({ id: `r-${n.id}-${w}-${k}`, device: 'd', ts: ts++, kind: 'review', card: `${w}:meaning`, grade: 'good' });
      }
      events.push({ id: `n-${n.id}`, device: 'd', ts: ts++, kind: 'node_done', body: { node: n.id, run: n.id, stats: { exercises: 0, graded: 0, firstTryCorrect: 0, newWords: n.newWords, reviews: 0 } } });
    }
    return replay([...events, ...extra]);
  }
  const build = (n: PathNode, state = stateAfter(n.id), unlocked = new Set(n.unlocked), seed = 's') =>
    buildLesson(n, { lex, path, state, now: new Date(T0 + 86400000 * 30), unlocked, seed });
  const kindsFor = (ex: Exercise[], id: string) => ex.filter(isGraded).filter((e) => e.lemma === id).map((e) => e.kind);

  it('an FR node is intro + Latin→English for each word, ~12 exercises, no class questions', () => {
    const n = node('s1.fr.1');
    const ex = build(n, stateAfter(n.id));
    expect(ex.length).toBeLessThanOrEqual(LESSON_SIZE);
    expect(ex.length).toBeGreaterThanOrEqual(2 * n.newWords.length);
    for (const w of n.newWords) {
      expect(ex.some((e) => e.type === 'intro' && e.lemma === w)).toBe(true);
      for (const k of kindsFor(ex, w)) expect(['meaning', 'recall']).toContain(k);
    }
    expect(ex.filter(isGraded).some((e) => e.kind === 'gender' || e.kind === 'conj' || e.kind === 'parse' || e.kind === 'produce')).toBe(false);
  });

  it('FR-only words never get class or forms exercises, even with everything unlocked', () => {
    const all = new Set([...featuresAt(4, true)]);
    const frOnly = new Set(lex.frOnly.map((w) => w.lemma.id));
    const state = stateAfter(null);
    for (const n of path.nodes) {
      for (const seed of ['a', 'b', 'c']) {
        for (const e of build(n, state, all, seed).filter(isGraded)) {
          if (frOnly.has(e.lemma)) expect(['meaning', 'recall'], `${n.id} ${e.card}`).toContain(e.kind);
        }
      }
    }
    const ctx = { lex, path, state, now: new Date(T0), unlocked: all, seed: 'x' };
    const ids = reviewCardIds(ctx, new Set(lex.words.map((w) => w.lemma.id)), 200);
    for (const id of ids) {
      const p = parseCardId(id)!;
      if (frOnly.has(p.lemma)) expect(['meaning', 'recall']).toContain(p.kind);
    }
  });

  it('English→Latin recall for an FR word uses its first citation form, after 2 good meaning reviews', () => {
    // First Repetītiō after the Cap. I preview.
    const n = path.nodes.find((x) => x.kind === 'repetitio' && path.index.get(x.id)! > path.index.get('s1.fr.1')!)!;
    // Only the two FR words have reviews, so the Repetītiō reaches their new recall cards.
    const done: VEvent[] = path.nodes.slice(0, path.index.get(n.id)!).map((x, i) => ({
      id: `n-${x.id}`, device: 'd', ts: T0 + i, kind: 'node_done' as const,
      body: { node: x.id, run: x.id, stats: { exercises: 0, graded: 0, firstTryCorrect: 0, newWords: x.newWords, reviews: 0 } },
    }));
    const goods: VEvent[] = ['capra-n1', 'a-indecl'].flatMap((w) => [0, 1].map((k) => ({
      id: `g-${w}-${k}`, device: 'd', ts: T0 + 1000 + k, kind: 'review' as const, card: `${w}:meaning`, grade: 'good' as const,
    })));
    const state = replay([...done, ...goods]);
    let found = false;
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      for (const e of build(n, state, new Set(n.unlocked), seed)) {
        if (e.type === 'typed' && e.kind === 'recall' && e.lemma === 'capra-n1') { expect(e.accepted[0]).toBe('capra'); expect(e.accepted).toContain('capra, caprae'); found = true; }
        if (e.type === 'typed' && e.kind === 'recall' && e.lemma === 'a-indecl') expect(e.accepted).toEqual(['ā', 'ab']);
      }
    }
    expect(found).toBe(true);
  });

  it('a previewed Wheelock word gets no class/forms until its paradigm is unlocked or Wheelock teaches it', () => {
    const afterFr = node('s1.fr.1');
    const ctxAt = (n: PathNode) => ({ lex, path, state: stateAfter(n.id), now: new Date(T0), unlocked: new Set(n.unlocked), seed: 'x', at: path.index.get(n.id)! });
    expect(formsLocked(ctxAt(afterFr), 'stella-n1')).toBe(true);
    expect(formsLocked(ctxAt(afterFr), 'capra-n1')).toBe(true);
    expect(formsLocked(ctxAt(afterFr), 'ambulo-v1')).toBe(false); // ordinary Wheelock word
    // Wheelock ch. 2 Verba teaches stella: normal treatment from there on (gender question).
    const v = path.nodes.find((x) => x.kind === 'verba' && x.newWords.includes('stella-n1'))!;
    expect(formsLocked(ctxAt(v), 'stella-n1')).toBe(false);
    // Gender is unlocked but the 1st declension isn't yet: still no class card for the preview.
    const known = new Set(lex.words.map((w) => w.lemma.id));
    const early = { ...ctxAt(afterFr), unlocked: featuresAt(2, false) };
    expect(reviewCardIds(early, known, 300)).not.toContain('stella-n1:class');
    expect(reviewCardIds({ ...ctxAt(v), unlocked: featuresAt(2, false) }, known, 300)).toContain('stella-n1:class');
    // capra stays meaning-only forever.
    expect(formsLocked(ctxAt(path.nodes[path.nodes.length - 1]!), 'capra-n1')).toBe(true);
  });

  it('distractors for FR words never share a sense with the answer', () => {
    for (const n of path.nodes.filter((x) => x.kind === 'fr')) {
      for (const e of build(n)) {
        if (e.type !== 'choice' || e.kind !== 'meaning') continue;
        expect(new Set(e.options.map((o) => o.text)).size).toBe(e.options.length);
      }
    }
  });
});

describe('FR: replay and sync are unaffected', () => {
  const path = buildPath(lexWith());
  let events: VEvent[];
  beforeEach(() => {
    events = [];
    let ts = Date.parse('2026-11-03T10:00:00Z');
    for (const n of path.nodes.slice(0, path.index.get('s2.verba.1')! + 1)) {
      for (const w of n.newWords) events.push({ id: `r-${n.id}-${w}`, device: 'd', ts: ts++, kind: 'review', card: `${w}:meaning`, grade: ts % 3 ? 'good' : 'again' });
      events.push({ id: `n-${n.id}`, device: 'd', ts: ts++, kind: 'node_done', body: { node: n.id, run: n.id, stats: { exercises: 0, graded: 0, firstTryCorrect: 0, newWords: n.newWords, reviews: 0 } } });
    }
  });

  it('a previewed word keeps one set of cards across its FR and Wheelock lessons', () => {
    const s = replay(events);
    const stellaCards = [...s.cards.keys()].filter((k) => k.startsWith('stella-n1:'));
    expect(stellaCards).toEqual(['stella-n1:meaning']);
    expect(events.filter((e) => e.card === 'stella-n1:meaning').length).toBe(2); // FR preview + Wheelock Verba
    expect(s.done.has('s1.fr.1')).toBe(true);
  });

  it('replay is order-independent with FR events', () => {
    const base = stateFingerprint(replay(events));
    for (let i = 0; i < 5; i++) expect(stateFingerprint(replay(shuffle(events, rng(i))))).toBe(base);
  });
});

/** Invented entries for FR chapters VIII–XVI (common Latin words, made-up glosses). */
const FR_LATER: FrSourceEntry[] = [
  S({ headword: 'cicāda, -ae, f.', pos: 'noun', gender: 'f', chapter: 8 }),                                     // → after section 9
  S({ headword: 'locus, -ī, m.', pos: 'noun', gender: 'm', chapter: 8, inWheelock: 9, wheelockHeadword: 'locus, locī, m.' }), // Wheelock 9 ≤ section 9
  S({ headword: 'quī? quae? quod?', pos: 'adj', chapter: 8 }),
  S({ headword: 'mūla, -ae, f.', pos: 'noun', gender: 'f', chapter: 9 }),                                       // → after section 10
  S({ headword: 'capiō, -ere, cēpī, captum', pos: 'verb', chapter: 9, inWheelock: 10, wheelockHeadword: 'capiō, capere, cēpī, captum' }), // Wheelock 10 ≤ section 10
  S({ headword: 'Iuppiter, Iovis, m.', pos: 'proper', properKind: 'deity', chapter: 9 }),
  S({ headword: 'Rōmānī, -ōrum, m. pl.', pos: 'proper', properKind: 'people', chapter: 9 }),
  S({ headword: 'volō, velle, voluī', pos: 'verb', chapter: 10, gloss: 'invented gloss: want' }),
  S({ headword: 'volō, -āre, -āvī, -ātum', pos: 'verb', chapter: 10, gloss: 'invented gloss: fly' }),
  S({ headword: 'vespa, -ae, f.', pos: 'noun', gender: 'f', chapter: 10 }),                                     // → after section 12
  S({ headword: 'Quīntus', pos: 'proper', properKind: 'name', chapter: 11 }),
  S({ headword: 'formīca, -ae, f.', pos: 'noun', gender: 'f', chapter: 11 }),
  S({ headword: 'Cancer, -crī, m.', pos: 'proper', properKind: 'constellation', chapter: 13 }),
  S({ headword: 'cancer, -crī, m.', pos: 'noun', gender: 'm', properKind: 'constellation', chapter: 13 }),      // a sign, whatever its pos
  S({ headword: 'Taurus, -ī, m.', pos: 'noun', gender: 'm', chapter: 13, gloss: 'Taurus (zodiac sign)' }),
  S({ headword: 'lucerna, -ae, f.', pos: 'noun', gender: 'f', chapter: 13 }),
  S({ headword: 'Aenēās, -ae, m.', pos: 'proper', properKind: 'person', chapter: 14 }),
  S({ headword: 'pila, -ae, f.', pos: 'noun', gender: 'f', chapter: 15 }),
  S({ headword: 'stola, -ae, f.', pos: 'noun', gender: 'f', chapter: 16 }),                                     // no placement yet
];
const ALL_W = [...FIX_WHEELOCK, ...FIX_WHEELOCK_58, ...FIX_WHEELOCK_910];
const importAll = () => importFr([...FR_SOURCE, ...FR_LATER], ALL_W);

describe('FR placement table (owner\'s study plan)', () => {
  it('maps FR chapters to the Wheelock section they follow', () => {
    expect(FR_PLACEMENT).toEqual({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 9, 9: 10, 10: 12, 11: 13, 12: 15, 13: 16, 14: 17, 15: 18 });
    expect(frSection(8)).toBe(9);
    expect(frSection(9)).toBe(10);
    expect(frSection(16)).toBeNull();
    // Each chapter comes after the one before it.
    const secs = Object.keys(FR_PLACEMENT).map(Number).sort((a, b) => a - b).map((c) => FR_PLACEMENT[c]!);
    expect(secs).toEqual([...secs].sort((a, b) => a - b));
  });

  it('drops a word Wheelock teaches by the placement section, not just by the FR chapter number', () => {
    const r = importAll();
    const why = (hw: string) => r.excluded.find((x) => x.entry.headword === hw)?.reason;
    expect(why('locus, -ī, m.')).toMatch(/Wheelock ch\. 9/);            // FR VIII, but after section 9
    expect(why('capiō, -ere, cēpī, captum')).toMatch(/Wheelock ch\. 10/); // FR IX, after section 10
    expect(why('stola, -ae, f.')).toMatch(/no placement/);
  });

  it('skips the zodiac signs (properKind constellation, or glossed as one) and every kind of proper name', () => {
    const r = importAll();
    const why = (hw: string) => r.excluded.find((x) => x.entry.headword === hw)?.reason;
    for (const hw of ['Cancer, -crī, m.', 'cancer, -crī, m.', 'Taurus, -ī, m.']) expect(why(hw)).toMatch(/zodiac/);
    for (const hw of ['Iuppiter, Iovis, m.', 'Rōmānī, -ōrum, m. pl.', 'Quīntus', 'Aenēās, -ae, m.']) expect(why(hw)).toMatch(/proper name/);
    const ids = r.entries.map((e) => e.lemma.id);
    expect(ids.some((id) => /^(cancer|taurus)-/.test(id))).toBe(false);
    expect(ids).toContain('lucerna-n1');
  });

  it('the two verbs volō (velle "want", -āre "fly") get different ids and stay two words', () => {
    const r = importAll();
    const vol = r.entries.filter((e) => e.lemma.parts[0] === 'volō');
    expect(vol).toHaveLength(2);
    expect(new Set(vol.map((e) => e.lemma.id)).size).toBe(2);
    expect(vol.map((e) => e.lemma.id)).toEqual(expect.arrayContaining(['volo-v1', 'volo-fr-verb']));
    const lex = buildLexicon(ALL_W, [...FIX_DCC, ...FIX_DCC_58, ...FIX_DCC_910], r.entries);
    expect(lex.byId.get('volo-v1')!.lemma.gloss).toMatch(/fly/);
    expect(lex.byId.get('volo-fr-verb')!.lemma.gloss).toMatch(/want/);
  });

  it('reads "quī? quae? quod?" as quī, quae, quod (distinct from the pronoun)', () => {
    const q = importAll().entries.find((e) => e.chapter === 8 && e.lemma.parts[0] === 'quī')!;
    expect(q.lemma.headword).toBe('quī, quae, quod');
    expect(q.lemma.id).toBe('qui-fr-adj');
  });

  describe('in a path with sections 1–10', () => {
    const r = importAll();
    const lex = buildLexicon(ALL_W, [...FIX_DCC, ...FIX_DCC_58, ...FIX_DCC_910], r.entries);
    const path = buildPath(lex);
    const frNodes = (p: Path, n: number) => p.sections.find((s) => s.spec.n === n)!.nodes.filter((x) => x.kind === 'fr');

    it('FR VIII comes after section 9, FR IX after section 10', () => {
      expect(path.sections.map((s) => s.spec.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(frNodes(path, 8)).toEqual([]); // nothing after section 8 any more
      expect(frNodes(path, 9).map((n) => [n.id, n.title])).toEqual([['s9.fr.1', 'Familia Rōmāna · Cap. VIII']]);
      expect(frNodes(path, 9)[0]!.newWords).toEqual(['cicada-n1', 'qui-fr-adj']);
      expect(frNodes(path, 10).map((n) => [n.id, n.title])).toEqual([['s10.fr.1', 'Familia Rōmāna · Cap. IX']]);
      expect(frNodes(path, 10)[0]!.newWords).toEqual(['mula-n1']);
      const s10 = path.sections.find((s) => s.spec.n === 10)!.nodes;
      expect(s10[s10.length - 1]!.kind).toBe('probatio');
    });

    it('FR X–XV wait while sections 12–18 don\'t exist', () => {
      const later = r.entries.filter((e) => e.chapter >= 10).map((e) => e.lemma.id);
      expect(later).toEqual(expect.arrayContaining(['volo-v1', 'volo-fr-verb', 'vespa-n1', 'formica-n1', 'lucerna-n1', 'pila-n1']));
      for (const id of later) expect(path.nodes.some((n) => n.newWords.includes(id)), id).toBe(false);
      expect(path.nodes.some((n) => /Cap\. (X|XI|XII|XIII|XIV|XV)\b/.test(n.title))).toBe(false);
    });

    it('FR I–VII nodes keep their ids, titles and words', () => {
      const before = buildPath(buildLexicon(ALL_W, [...FIX_DCC, ...FIX_DCC_58, ...FIX_DCC_910], importFr(FR_SOURCE, ALL_W).entries));
      const sig = (p: Path) => p.nodes.filter((n) => n.kind === 'fr' && n.section <= 7).map((n) => [n.id, n.title, n.newWords]);
      expect(sig(path)).toEqual(sig(before));
      expect(sig(path).map((x) => x[0])).toEqual(expect.arrayContaining(['s1.fr.1', 's3.fr.1', 's3.fr.2', 's6.fr.1']));
      // Every node the shorter list had is still there, in the same order.
      const ids = new Set(path.nodes.map((n) => n.id));
      expect(before.nodes.every((n) => ids.has(n.id))).toBe(true);
      const order = path.nodes.map((n) => n.id).filter((id) => before.index.has(id));
      expect(order).toEqual(before.nodes.map((n) => n.id));
    });
  });
});
