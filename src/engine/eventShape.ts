/**
 * Validation for event records arriving from outside this device (backup files,
 * the sync server, sync uploads). Pure and dependency-free so the Worker can
 * import it too. The shape is the client's `VEvent` (see events.ts).
 */
import type { EventKind, FlagBody, VEvent } from './events.ts';

/** Why an exercise was flagged (Lesson → flag button). */
export type FlagReason = 'wrong-answer' | 'bad-latin' | 'bad-english' | 'other';
export const FLAG_REASONS: readonly FlagReason[] = ['wrong-answer', 'bad-latin', 'bad-english', 'other'];

export const EVENT_KINDS: ReadonlySet<EventKind> = new Set<EventKind>(['review', 'node_done', 'setting', 'flag']);
export const MAX_EVENT_ID_LEN = 128;
/** Upper bound on JSON.stringify(body) for one event. */
export const MAX_EVENT_BODY_LEN = 16_384;
export const MAX_FLAG_NOTE_LEN = 1000;
export const MAX_FLAG_SHOWN_LEN = 500;

/** Why a flag body is invalid, or null. Flags carry {ref, reason, note?, shown?, node?}. */
function flagError(b: unknown): string | null {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'flag body';
  const f = b as Partial<Record<keyof FlagBody, unknown>>;
  if (typeof f.ref !== 'string' || !f.ref || f.ref.length > 256) return 'flag ref';
  if (typeof f.reason !== 'string' || !(FLAG_REASONS as readonly string[]).includes(f.reason)) return 'flag reason';
  if (f.note !== undefined && (typeof f.note !== 'string' || f.note.length > MAX_FLAG_NOTE_LEN)) return 'flag note';
  if (f.shown !== undefined && (typeof f.shown !== 'string' || f.shown.length > MAX_FLAG_SHOWN_LEN)) return 'flag shown';
  if (f.node !== undefined && (typeof f.node !== 'string' || f.node.length > MAX_EVENT_ID_LEN)) return 'flag node';
  return null;
}

const isStr = (v: unknown, max = MAX_EVENT_ID_LEN): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/**
 * Check one event and return a clean copy (only the synced fields, no `outbox`).
 * Throws `Invalid event at index i: <why>`.
 */
export function parseEvent(raw: unknown, i: number): VEvent {
  const bad = (why: string): never => { throw new Error(`Invalid event at index ${i}: ${why}`); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad('not an object');
  const o = raw as Record<string, unknown>;
  if (!isStr(o.id)) bad('id');
  if (!isStr(o.device)) bad('device');
  if (typeof o.ts !== 'number' || !Number.isFinite(o.ts) || !Number.isInteger(o.ts) || o.ts < 0) bad('ts');
  if (typeof o.kind !== 'string' || !EVENT_KINDS.has(o.kind as EventKind)) bad('kind');
  if (o.card !== undefined && o.card !== null && !isStr(o.card, 256)) bad('card');
  if (o.grade !== undefined && o.grade !== null && o.grade !== 'good' && o.grade !== 'again') bad('grade');
  if (o.body !== undefined && o.body !== null) {
    if (typeof o.body !== 'object' || Array.isArray(o.body)) bad('body');
    if (JSON.stringify(o.body).length > MAX_EVENT_BODY_LEN) bad('body too large');
  }
  if (o.kind === 'flag') { const why = flagError(o.body); if (why) bad(why); }
  const e: VEvent = { id: o.id as string, device: o.device as string, ts: o.ts as number, kind: o.kind as EventKind };
  if (typeof o.card === 'string') e.card = o.card;
  if (o.grade === 'good' || o.grade === 'again') e.grade = o.grade;
  if (o.body && typeof o.body === 'object') e.body = o.body as VEvent['body'];
  return e;
}

/** Strip device-local bookkeeping before an event leaves the device. */
export function wireEvent(e: VEvent): VEvent {
  const { outbox: _o, ...rest } = e;
  return rest;
}
