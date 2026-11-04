/** JSON backup of the event log: export, validate, merge (idempotent by event id). */
import { canonical, type VEvent } from './events.ts';

export const BACKUP_FORMAT = 'vocabula-events';
export const BACKUP_VERSION = 1;

export interface Backup { format: typeof BACKUP_FORMAT; version: number; exportedAt: string; device: string; events: VEvent[] }

export function makeBackup(events: readonly VEvent[], device: string, now = new Date()): Backup {
  // outbox is device-local sync bookkeeping, not part of the backup.
  const evs = canonical(events).map(({ outbox: _o, ...e }) => e);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), device, events: evs };
}

const KINDS = new Set(['review', 'node_done', 'setting']);

export function parseBackup(raw: unknown): VEvent[] {
  const b = raw as Partial<Backup> | null;
  if (!b || b.format !== BACKUP_FORMAT) throw new Error('Not a Vocābula backup file');
  if (b.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version ${String(b.version)}`);
  if (!Array.isArray(b.events)) throw new Error('Backup has no events');
  return b.events.map((e, i) => {
    const o = e as Partial<VEvent>;
    if (typeof o.id !== 'string' || typeof o.device !== 'string' || typeof o.ts !== 'number' || !KINDS.has(o.kind as string)) {
      throw new Error(`Invalid event at index ${i}`);
    }
    return o as VEvent;
  });
}

/** Events from `incoming` whose id isn't already in `existing`. */
export function newEvents(existing: readonly VEvent[], incoming: readonly VEvent[]): VEvent[] {
  const have = new Set(existing.map((e) => e.id));
  const out: VEvent[] = [];
  for (const e of incoming) if (!have.has(e.id)) { have.add(e.id); out.push(e); }
  return out;
}

export const mergeEvents = (a: readonly VEvent[], b: readonly VEvent[]): VEvent[] => canonical([...a, ...b]);
