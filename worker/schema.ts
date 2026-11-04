/**
 * Schema, created lazily: the deploy pipeline runs no migrations, so the first
 * API request in each isolate runs CREATE TABLE IF NOT EXISTS (memoized).
 * migrations/0001_init.sql holds the same SQL for reference / manual use.
 */
import type { D1Like } from './d1.ts';

export const SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS packs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body TEXT NOT NULL,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  device TEXT NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  card TEXT,
  grade TEXT,
  body TEXT,
  received_at TEXT NOT NULL
)`,
];

const ready = new WeakMap<D1Like, Promise<void>>();

/** Create tables once per isolate (per database object). A failure is not memoized. */
export function ensureSchema(db: D1Like): Promise<void> {
  let p = ready.get(db);
  if (!p) {
    p = db.batch(SCHEMA.map((q) => db.prepare(q))).then(() => undefined);
    p.catch(() => ready.delete(db));
    ready.set(db, p);
  }
  return p;
}
