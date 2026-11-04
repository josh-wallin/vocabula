/**
 * Validation for event records arriving from outside this device (backup files,
 * the sync server, sync uploads). Pure and dependency-free so the Worker can
 * import it too. The shape is the client's `VEvent` (see events.ts).
 */
import type { EventKind, VEvent } from './events.ts';

export const EVENT_KINDS: ReadonlySet<EventKind> = new Set<EventKind>(['review', 'node_done', 'setting']);
export const MAX_EVENT_ID_LEN = 128;
/** Upper bound on JSON.stringify(body) for one event. */
export const MAX_EVENT_BODY_LEN = 16_384;

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
