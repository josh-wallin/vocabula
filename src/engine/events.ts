/**
 * Append-only event log and deterministic replay.
 *
 * Every piece of derived state (FSRS cards, path progress, streak, puncta,
 * settings) is recomputed by replaying events sorted by (ts, id). The same
 * set of events therefore gives the same state on any device, in any
 * insertion order, which is what a future server sync relies on to merge.
 */
import type { Card } from 'ts-fsrs';
import { review, type Grade, parseCardId } from './srs.ts';
import { dayNum, dayStr, localDay } from './util.ts';

export type EventKind = 'review' | 'node_done' | 'setting';

export interface LessonStats {
  exercises: number;
  graded: number;
  firstTryCorrect: number;
  newWords: string[];
  reviews: number;
}

export interface ReviewBody { node?: string; run?: string }
export interface NodeDoneBody { node: string; run: string; stats: LessonStats }
export interface SettingBody { key: string; value: unknown }

export interface VEvent {
  id: string;
  device: string;
  ts: number;
  kind: EventKind;
  card?: string;
  grade?: Grade;
  body?: ReviewBody | NodeDoneBody | SettingBody;
  /** 1 = not yet uploaded to the (future) sync server. Not part of derived state. */
  outbox?: 0 | 1;
}

export const PUNCTA_PER_LESSON = 10;
export const PUNCTA_PER_GOOD_REVIEW = 2;
export const FREEZES_PER_WEEK = 2;

export interface DerivedState {
  cards: Map<string, Card>;
  /** Last grade per card, for "recently missed". */
  last: Map<string, { grade: Grade; ts: number }>;
  /** Number of correct first attempts on {lemma}:meaning, per lemma. */
  meaningGood: Map<string, number>;
  /** Lemmas the learner has met (introduced in a finished node, or reviewed). */
  seen: Set<string>;
  done: Set<string>;
  /** Completed lessons in order. */
  lessons: { node: string; run: string; ts: number; stats: LessonStats }[];
  puncta: number;
  /** Local days with at least one finished lesson. */
  days: Set<string>;
  settings: Record<string, unknown>;
  reviewCount: number;
}

export const compareEvents = (a: VEvent, b: VEvent): number =>
  a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Sort and de-duplicate by id. */
export function canonical(events: readonly VEvent[]): VEvent[] {
  const byId = new Map<string, VEvent>();
  for (const e of events) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort(compareEvents);
}

export function replay(events: readonly VEvent[]): DerivedState {
  const s: DerivedState = {
    cards: new Map(), last: new Map(), meaningGood: new Map(), seen: new Set(), done: new Set(),
    lessons: [], puncta: 0, days: new Set(), settings: {}, reviewCount: 0,
  };
  for (const e of canonical(events)) {
    switch (e.kind) {
      case 'review': {
        if (!e.card || (e.grade !== 'good' && e.grade !== 'again')) break;
        s.cards.set(e.card, review(s.cards.get(e.card), new Date(e.ts), e.grade));
        s.last.set(e.card, { grade: e.grade, ts: e.ts });
        s.reviewCount++;
        const p = parseCardId(e.card);
        if (p) {
          s.seen.add(p.lemma);
          if (p.kind === 'meaning' && e.grade === 'good') s.meaningGood.set(p.lemma, (s.meaningGood.get(p.lemma) ?? 0) + 1);
        }
        if (e.grade === 'good') s.puncta += PUNCTA_PER_GOOD_REVIEW;
        break;
      }
      case 'node_done': {
        const b = e.body as NodeDoneBody | undefined;
        if (!b?.node) break;
        s.done.add(b.node);
        s.lessons.push({ node: b.node, run: b.run, ts: e.ts, stats: b.stats });
        for (const w of b.stats?.newWords ?? []) s.seen.add(w);
        s.puncta += PUNCTA_PER_LESSON;
        s.days.add(localDay(e.ts));
        break;
      }
      case 'setting': {
        const b = e.body as SettingBody | undefined;
        if (b?.key) s.settings[b.key] = b.value;
        break;
      }
    }
  }
  return s;
}

/** Monday-based week key for a day number (days since epoch; 1970-01-01 was a Thursday). */
const weekOf = (n: number): number => Math.floor((n + 3) / 7);

/**
 * Day streak on `today` (local "YYYY-MM-DD"). A day counts if at least one
 * lesson was finished. Today not yet practised doesn't break the streak.
 * A missed day is bridged by a freeze, at most FREEZES_PER_WEEK per Monday-based week;
 * frozen days keep the streak alive but don't add to it.
 */
export function streak(days: ReadonlySet<string>, today: string): { count: number; frozen: string[]; today: boolean } {
  if (days.size === 0) return { count: 0, frozen: [], today: false };
  const first = Math.min(...[...days].map(dayNum));
  const t = dayNum(today);
  const doneToday = days.has(today);
  let count = 0;
  let pending: string[] = []; // freezes not yet backed by an older practised day
  const frozen: string[] = [];
  const used = new Map<number, number>();
  for (let d = doneToday ? t : t - 1; d >= first; d--) {
    const ds = dayStr(d);
    if (days.has(ds)) { count++; frozen.push(...pending); pending = []; continue; }
    const w = weekOf(d);
    if ((used.get(w) ?? 0) >= FREEZES_PER_WEEK) break;
    used.set(w, (used.get(w) ?? 0) + 1);
    pending.push(ds);
  }
  return { count, frozen, today: doneToday };
}

/** Serialize state for comparisons (tests) — Maps/Sets sorted. */
export function stateFingerprint(s: DerivedState): string {
  const sortObj = <V>(m: Map<string, V>) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify({
    cards: sortObj(s.cards), last: sortObj(s.last), mg: sortObj(s.meaningGood),
    seen: [...s.seen].sort(), done: [...s.done].sort(), lessons: s.lessons, puncta: s.puncta,
    days: [...s.days].sort(), settings: s.settings, reviews: s.reviewCount,
  });
}
