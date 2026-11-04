/**
 * IndexedDB (via idb): the append-only event log, the imported content pack
 * and small device-local metadata (device id).
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { VEvent } from '../engine/events.ts';
import type { ContentPack } from './pack.ts';
import { uuid } from '../engine/util.ts';

interface VocabulaDB extends DBSchema {
  events: { key: string; value: VEvent; indexes: { outbox: number } };
  content: { key: string; value: { key: string; pack: ContentPack; importedAt: number } };
  meta: { key: string; value: { key: string; value: string } };
}

export const DB_NAME = 'vocabula';
let dbp: Promise<IDBPDatabase<VocabulaDB>> | null = null;

export function db(): Promise<IDBPDatabase<VocabulaDB>> {
  dbp ??= openDB<VocabulaDB>(DB_NAME, 1, {
    upgrade(d) {
      const ev = d.createObjectStore('events', { keyPath: 'id' });
      ev.createIndex('outbox', 'outbox');
      d.createObjectStore('content', { keyPath: 'key' });
      d.createObjectStore('meta', { keyPath: 'key' });
    },
  });
  return dbp;
}

export async function deviceId(): Promise<string> {
  const d = await db();
  const hit = await d.get('meta', 'device');
  if (hit) return hit.value;
  const id = uuid();
  await d.put('meta', { key: 'device', value: id });
  return id;
}

export async function allEvents(): Promise<VEvent[]> {
  return (await db()).getAll('events');
}

/** Append events; existing ids are left untouched (idempotent). Returns how many were new. */
export async function putEvents(events: readonly VEvent[]): Promise<number> {
  const d = await db();
  const tx = d.transaction('events', 'readwrite');
  let added = 0;
  for (const e of events) {
    if (await tx.store.getKey(e.id)) continue;
    await tx.store.add(e);
    added++;
  }
  await tx.done;
  return added;
}

export async function outboxCount(): Promise<number> {
  return (await db()).countFromIndex('events', 'outbox', 1);
}

export async function getPack(): Promise<ContentPack | null> {
  return (await (await db()).get('content', 'pack'))?.pack ?? null;
}

export async function savePack(pack: ContentPack): Promise<void> {
  await (await db()).put('content', { key: 'pack', pack, importedAt: Date.now() });
}
