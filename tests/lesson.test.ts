import { describe, expect, it } from 'vitest';
import { fixLexicon } from './fixtures.ts';
import { buildPath, type PathNode } from '../src/engine/path.ts';
import { buildLesson, isGraded, glossOverlap, LESSON_SIZE, PROBATIO_SIZE, REVIEW_SIZE, type Exercise, reviewCardIds } from '../src/engine/lesson.ts';
import { replay, type VEvent } from '../src/engine/events.ts';
import { featureOfCell, hasFeature, type FeatureId } from '../src/engine/curriculum.ts';
import { generate } from '../src/morph/generate.ts';
import type { CellId } from '../src/morph/types.ts';
import { Session, REQUEUE_GAP } from '../src/engine/session.ts';
import { parseCardId } from '../src/engine/srs.ts';

const lex = fixLexicon();
const path = buildPath(lex);
const node = (id: string) => path.nodes.find((n) => n.id === id)!;
const T0 = Date.parse('2026-11-03T10:00:00Z');

function stateAfter(upTo: string, extra: VEvent[] = []) {
  const events: VEvent[] = [];
  let ts = T0;
  for (const n of path.nodes) {
    if (n.id === upTo) break;
    for (const w of n.newWords) {
      events.push({ id: `r-${n.id}-${w}`, device: 'd', ts: ts++, kind: 'review', card: `${w}:meaning`, grade: 'good' });
    }
    events.push({ id: `n-${n.id}`, device: 'd', ts: ts++, kind: 'node_done', body: { node: n.id, run: n.id, stats: { exercises: 0, graded: 0, firstTryCorrect: 0, newWords: n.newWords, reviews: 0 } } });
  }
  return replay([...events, ...extra]);
}

function build(n: PathNode, state = stateAfter(n.id), now = new Date(T0 + 86400000 * 5), seed = 'seed') {
  return buildLesson(n, { lex, path, state, now, unlocked: new Set(n.unlocked), seed });
}

/** Every Latin form an exercise asks about must come from an unlocked cell. */
function checkUnlockedCells(ex: Exercise[], unlocked: ReadonlySet<FeatureId>) {
  for (const e of ex) {
    if (!isGraded(e)) continue;
    const p = parseCardId(e.card)!;
    if (p.kind === 'forms') expect(hasFeature(unlocked, p.feature as FeatureId), e.card).toBe(true);
    if (e.kind === 'parse') {
      const l = lex.byId.get(e.lemma)!.lemma;
      for (const o of e.options) {
        const f = featureOfCell(l, o.id as CellId);
        expect(f !== null && hasFeature(unlocked, f), `${e.lemma} ${o.id}`).toBe(true);
      }
    }
    if (e.kind === 'produce') {
      const l = lex.byId.get(e.lemma)!.lemma;
      const forms = generate(l);
      const cell = (Object.keys(forms) as CellId[]).find((c) => forms[c] === e.accepted[0])!;
      expect(hasFeature(unlocked, featureOfCell(l, cell)!)).toBe(true);
    }
    if (e.kind === 'gender') {
      if (!unlocked.has('gender.n')) expect(e.options.map((o) => o.id)).not.toContain('n');
    }
  }
}

describe('lesson builder', () => {
  it('Verba lesson: 10–12 exercises, intro before each quiz, no forms drills before the pattern', () => {
    const n = node('s1.verba.1');
    const ex = build(n);
    expect(ex.length).toBeGreaterThanOrEqual(10);
    expect(ex.length).toBeLessThanOrEqual(LESSON_SIZE);
    for (const w of n.newWords) {
      const intro = ex.findIndex((e) => e.type === 'intro' && e.lemma === w);
      const quiz = ex.findIndex((e) => e.type === 'choice' && e.kind === 'meaning' && e.lemma === w);
      expect(intro).toBeGreaterThanOrEqual(0);
      expect(quiz).toBeGreaterThan(intro);
    }
    expect(ex.some((e) => e.kind === 'parse' || e.kind === 'produce')).toBe(false);
    expect(ex.some((e) => e.kind === 'conj')).toBe(true);
    checkUnlockedCells(ex, new Set(n.unlocked));
  });

  it('meaning distractors: never identical/overlapping glosses, same POS when possible', () => {
    for (const n of path.nodes.filter((x) => x.kind === 'verba' || x.kind === 'dcc')) {
      for (const e of build(n)) {
        if (e.type !== 'choice' || e.kind !== 'meaning') continue;
        const right = e.options.find((o) => o.id === 'a')!;
        const wrong = e.options.filter((o) => o.id !== 'a');
        expect(wrong.length).toBe(3);
        for (const w of wrong) expect(glossOverlap(w.text, right.text)).toBe(false);
        expect(new Set(e.options.map((o) => o.text)).size).toBe(4);
      }
    }
    expect(glossOverlap('to preserve, save, keep', 'to preserve, conserve')).toBe(true);
    expect(glossOverlap('girl', 'boy; pl. boys, children')).toBe(false);
  });

  it('pattern node opens with a grammar card and drills only unlocked cells', () => {
    for (const id of ['s1.pattern', 's2.pattern', 's3.pattern', 's4.pattern']) {
      const n = node(id);
      const ex = build(n);
      expect(ex[0]!.type).toBe('grammar');
      expect(ex.length).toBeGreaterThanOrEqual(10);
      expect(ex.length).toBeLessThanOrEqual(LESSON_SIZE);
      checkUnlockedCells(ex, new Set(n.unlocked));
      expect(ex.filter(isGraded).every((e) => e.kind === 'parse' || e.kind === 'produce')).toBe(true);
    }
  });

  it('section 2 pattern drills 1st declension, never 2nd-declension or neuter cells', () => {
    const ex = build(node('s2.pattern'));
    for (const e of ex.filter(isGraded)) {
      const f = parseCardId(e.card)!.feature;
      expect(['n1', 'adj.f', 'sum.3sg']).toContain(f);
    }
  });

  it('ambiguous forms use "select all that fit" with the full answer set', () => {
    const all = path.nodes.flatMap((n) => build(n, stateAfter(n.id), new Date(T0 + 86400000 * 5), `s-${n.id}`));
    const multi = all.filter((e): e is Extract<Exercise, { type: 'choice' }> => e.type === 'choice' && e.multi);
    expect(multi.length).toBeGreaterThan(0);
    const casae = { ...multi[0]! };
    expect(casae.answer.length).toBeGreaterThan(1);
    for (const e of multi) {
      for (const a of e.answer) expect(e.options.map((o) => o.id)).toContain(a);
    }
  });

  it('Repetītiō has 12–15 exercises; Probātiō ~20', () => {
    const r = build(node('s2.rep.1'));
    expect(r.length).toBe(REVIEW_SIZE);
    const p = build(node('s4.probatio'));
    expect(p.length).toBe(PROBATIO_SIZE);
    checkUnlockedCells(p, new Set(node('s4.probatio').unlocked));
  });

  it('Repetītiō picks due cards first and tops up with recent misses', () => {
    const n = node('s2.rep.1');
    const miss: VEvent = { id: 'zz-miss', device: 'd', ts: T0 + 3600_000, kind: 'review', card: 'stella-n1:meaning', grade: 'again' };
    const state = stateAfter(n.id, [miss]);
    const ctx = { lex, path, state, now: new Date(T0 + 7200_000), unlocked: new Set(n.unlocked), seed: 'x' };
    const known = new Set(path.knownAt(n.id));
    const ids = reviewCardIds(ctx, known, 13);
    expect(ids).toContain('stella-n1:meaning');
    expect(ids.length).toBe(13);
  });

  it('English→Latin recall only after 2 correct meaning reviews', () => {
    const n = node('s1.rep.1');
    const once = stateAfter(n.id);
    const ex1 = build(n, once);
    expect(ex1.some((e) => e.kind === 'recall')).toBe(false);
    const more: VEvent[] = path.knownAt(n.id).map((w, i) => ({ id: `m2-${i}`, device: 'd', ts: T0 + 100000 + i, kind: 'review', card: `${w}:meaning`, grade: 'good' }));
    const ex2 = build(n, stateAfter(n.id, more));
    expect(ex2.some((e) => e.kind === 'recall')).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const n = node('s3.formae');
    expect(JSON.stringify(build(n, undefined, undefined, 'a'))).toBe(JSON.stringify(build(n, undefined, undefined, 'a')));
  });
});

describe('session requeue', () => {
  const ex = build(node('s1.verba.1'));

  it('a missed item comes back REQUEUE_GAP exercises later, ungraded', () => {
    const s = new Session(ex);
    while (!isGraded(s.current!.ex)) s.advance();
    const missedAt = s.pos;
    const missed = s.current!.ex;
    const o = s.answer(missed.type === 'choice' ? ['__wrong__'] : 'zzz');
    expect(o.ok).toBe(false);
    expect(o.grade).toBe('again');
    expect(s.queue.length).toBe(ex.length + 1);
    expect(s.queue[missedAt + 1 + REQUEUE_GAP]!.ex).toBe(missed);
    expect(s.queue[missedAt + 1 + REQUEUE_GAP]!.retry).toBe(1);
    // advance to the retry and answer it correctly: not graded
    s.advance();
    while (s.pos < missedAt + 1 + REQUEUE_GAP) s.advance();
    const retry = s.current!.ex;
    if (retry.type !== 'choice') throw new Error('expected choice');
    const o2 = s.answer(retry.answer);
    expect(o2.ok).toBe(true);
    expect(o2.grade).toBeUndefined();
    expect(s.graded).toBe(1);
    expect(s.reviews).toEqual([{ card: missed.type === 'choice' || missed.type === 'typed' ? missed.card : '', grade: 'again' }]);
  });

  it('only first attempts count toward first-try accuracy', () => {
    const s = new Session(ex);
    let n = 0;
    while (!s.done) {
      const e = s.current!.ex;
      if (isGraded(e)) {
        n++;
        if (e.type === 'choice') s.answer(n === 1 ? [] : e.answer);
        else s.answer(e.accepted[0]!);
      }
      s.advance();
    }
    const gradedCount = ex.filter(isGraded).length;
    expect(s.graded).toBe(gradedCount);
    expect(s.firstTryCorrect).toBe(gradedCount - 1);
  });
});
