/**
 * App controller: holds content + event log, derives state by replay,
 * and records new events. UI components read from here.
 */
import { buildLexicon, type Lexicon } from '../engine/lexicon.ts';
import { buildPath, currentNodeIndex, type Path, type PathNode } from '../engine/path.ts';
import { replay, streak, type DerivedState, type FlagBody, type LessonStats, type NodeDoneBody, type VEvent } from '../engine/events.ts';
import { loadBundled, type Bundled } from '../content/bundled.ts';
import { buildLesson, type Exercise } from '../engine/lesson.ts';
import type { AudioRef } from '../audio/items.ts';
import type { FeatureId } from '../engine/curriculum.ts';
import type { Grade } from '../engine/srs.ts';
import { encodeSyncCode, type DaySummary } from '../engine/syncCode.ts';
import { makeBackup, newEvents, parseBackup } from '../engine/backup.ts';
import { localDay, uuid } from '../engine/util.ts';
import { loadContent, type Content } from '../data/contentStore.ts';
import { allEvents, deviceId, putEvents } from '../data/db.ts';
import { parseCardId } from '../engine/srs.ts';

export const PRACTICE_NODE = 'practice';

export interface AppData {
  content: Content;
  /** Public bundled content: sentence bank, Audītiō lessons, Lectiō passages. */
  bundled: Bundled;
  lex: Lexicon;
  path: Path;
  events: VEvent[];
  state: DerivedState;
  device: string;
}

export async function loadApp(): Promise<AppData | null> {
  const content = await loadContent();
  if (!content) return null;
  const bundled = await loadBundled();
  const lex = buildLexicon(content.wheelock, content.dcc, content.fr);
  const path = buildPath(lex, { listening: bundled.listening, lectio: bundled.lectio });
  const [events, device] = await Promise.all([allEvents(), deviceId()]);
  return { content, bundled, lex, path, events, state: replay(events), device };
}

export function withEvents(app: AppData, added: readonly VEvent[]): AppData {
  const events = [...app.events, ...added];
  return { ...app, events, state: replay(events) };
}

/** Index of the learner's current node and its section. */
export function frontier(app: AppData): { index: number; node: PathNode | undefined; section: number } {
  const index = currentNodeIndex(app.path, app.state.done);
  const node = app.path.nodes[index];
  const section = node?.section ?? app.path.sections[app.path.sections.length - 1]!.spec.n;
  return { index, node, section };
}

/** A pseudo-node for ad-hoc practice (Repetītiō over everything learned so far). */
export function practiceNode(app: AppData): PathNode {
  const f = frontier(app);
  const last = app.path.nodes[Math.max(0, f.index - 1)];
  return {
    id: PRACTICE_NODE, section: f.section, kind: 'repetitio', title: 'Repetītiō', newWords: [],
    unlocked: last?.unlocked ?? [], focus: [], drill: [],
  };
}

/** Listening settings (synced 'setting' events; both default on). */
export const SETTING_LISTENING = 'listening';
export const SETTING_AUTOPLAY = 'autoplay';
export const settingOn = (app: AppData, key: string): boolean => app.state.settings[key] !== false;

export interface LessonOpts {
  /** Whether a clip is likely playable now; listening exercises only when given and the setting is on. */
  audioAvailable?: (clip: AudioRef) => boolean;
}

export function lessonFor(app: AppData, node: PathNode, now = new Date(), opts: LessonOpts = {}): Exercise[] {
  const f = frontier(app);
  // A lesson can use the features of its node plus whatever the learner has already unlocked.
  const prev = app.path.nodes[Math.max(0, Math.min(f.index, app.path.nodes.length) - 1)];
  const unlocked = new Set<FeatureId>([...node.unlocked, ...(f.index > 0 ? prev?.unlocked ?? [] : [])]);
  const pathForKnown = node.id === PRACTICE_NODE
    ? { ...app.path, knownAt: () => app.path.knownAt(prev?.id ?? '') }
    : app.path;
  return buildLesson(node, {
    lex: app.lex, path: pathForKnown, state: app.state, now, unlocked, seed: `${node.id}:${now.getTime()}`, sentences: app.bundled.sentences,
    auditio: app.bundled.listening,
    lectio: app.bundled.lectio,
    ...(opts.audioAvailable && settingOn(app, SETTING_LISTENING) ? { listening: { available: opts.audioAvailable } } : {}),
  });
}

function ev(app: AppData, kind: VEvent['kind'], extra: Partial<VEvent>, ts = Date.now()): VEvent {
  return { id: uuid(), device: app.device, ts, kind, outbox: 1, ...extra };
}

/** Persist a review; returns the event so callers can fold it into the latest state. */
export async function recordReview(app: AppData, card: string, grade: Grade, node: string, run: string): Promise<VEvent> {
  const e = ev(app, 'review', { card, grade, body: { node, run } });
  await putEvents([e]);
  return e;
}

export async function recordNodeDone(app: AppData, node: string, run: string, stats: LessonStats): Promise<AppData> {
  const body: NodeDoneBody = { node, run, stats };
  const e = ev(app, 'node_done', { body });
  await putEvents([e]);
  return withEvents(app, [e]);
}

/** Persist a setting (synced; the latest ts wins on every device). */
export async function recordSetting(app: AppData, key: string, value: unknown): Promise<AppData> {
  const e = ev(app, 'setting', { body: { key, value } });
  await putEvents([e]);
  return withEvents(app, [e]);
}

/** Persist a flag on an exercise (synced like any event; listed in Profile). */
export async function recordFlag(app: AppData, body: FlagBody): Promise<VEvent> {
  const e = ev(app, 'flag', { body });
  await putEvents([e]);
  return e;
}

export function streakNow(app: AppData, now = new Date()) {
  return streak(app.state.days, localDay(now));
}

/** Today's summary for the Iter Latinum code. */
export function todaySummary(app: AppData, now = new Date()): DaySummary {
  const day = localDay(now);
  const lessons = app.state.lessons.filter((l) => localDay(l.ts) === day);
  return {
    date: day,
    lessons: lessons.length,
    newWords: lessons.reduce((n, l) => n + (l.stats?.newWords?.length ?? 0), 0),
    reviews: app.events.filter((e) => e.kind === 'review' && localDay(e.ts) === day).length,
  };
}

export const syncCodeToday = (app: AppData, now = new Date()): string => encodeSyncCode(todaySummary(app, now));

/** Lemmas reviewed in a run, soonest-due first (missed ones lead). */
export function comingBack(app: AppData, run: string): { lemma: string; missed: boolean }[] {
  const reviews = app.events.filter((e) => e.kind === 'review' && (e.body as { run?: string } | undefined)?.run === run);
  const byLemma = new Map<string, { due: number; missed: boolean }>();
  for (const e of reviews) {
    const p = parseCardId(e.card ?? '');
    if (!p) continue;
    const c = app.state.cards.get(e.card!);
    const due = c ? c.due.getTime() : Infinity;
    const cur = byLemma.get(p.lemma);
    const missed = (cur?.missed ?? false) || e.grade === 'again';
    byLemma.set(p.lemma, { due: Math.min(cur?.due ?? Infinity, due), missed });
  }
  return [...byLemma.entries()]
    .sort((a, b) => Number(b[1].missed) - Number(a[1].missed) || a[1].due - b[1].due)
    .map(([lemma, v]) => ({ lemma, missed: v.missed }));
}

/* ---------------- backup ---------------- */

export function exportBackupText(app: AppData): string {
  return JSON.stringify(makeBackup(app.events, app.device), null, 1);
}

export async function importBackupText(app: AppData, text: string): Promise<{ app: AppData; added: number }> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('That file isn’t valid JSON.'); }
  const incoming = parseBackup(raw).map((e) => ({ ...e, outbox: 1 as const }));
  const fresh = newEvents(app.events, incoming);
  await putEvents(fresh);
  return { app: withEvents(app, fresh), added: fresh.length };
}
