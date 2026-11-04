/**
 * A small D1 stand-in over node:sqlite (in-memory): prepare/bind/first/all/run/batch.
 * Enough for the Worker handlers; real SQLite, so SQL behaves as in D1.
 */
import { createRequire } from 'node:module';
import type { D1Like, D1Res, D1Stmt } from '../worker/d1.ts';

type SqlValue = string | number | bigint | null | Uint8Array;
interface SyncStmt { all(...p: SqlValue[]): unknown[]; run(...p: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint } }
interface SyncDb { prepare(q: string): SyncStmt; exec(q: string): void }

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => SyncDb };

const returnsRows = (q: string) => /^\s*(SELECT|WITH|PRAGMA)\b/i.test(q) || /\bRETURNING\b/i.test(q);

class FakeStmt implements D1Stmt {
  constructor(private readonly db: FakeD1, readonly sql: string, readonly params: SqlValue[] = []) {}
  bind(...values: unknown[]): D1Stmt {
    return new FakeStmt(this.db, this.sql, values.map((v) => (v === undefined ? null : (v as SqlValue))));
  }
  exec<T>(): D1Res<T> {
    this.db.calls.push(this.sql);
    const st = this.db.raw.prepare(this.sql);
    if (returnsRows(this.sql)) {
      const rows = st.all(...this.params).map((r) => ({ ...(r as object) })) as T[];
      return { results: rows, success: true, meta: { changes: 0 } };
    }
    const r = st.run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async first<T>(): Promise<T | null> { return (this.exec<T>().results[0] ?? null); }
  async all<T>(): Promise<D1Res<T>> { return this.exec<T>(); }
  async run<T>(): Promise<D1Res<T>> { return this.exec<T>(); }
}

export class FakeD1 implements D1Like {
  readonly raw: SyncDb = new DatabaseSync(':memory:');
  readonly calls: string[] = [];
  prepare(query: string): D1Stmt { return new FakeStmt(this, query); }
  async batch<T>(statements: D1Stmt[]): Promise<D1Res<T>[]> {
    // D1 batches run as one transaction.
    this.raw.exec('BEGIN');
    try {
      const out = statements.map((s) => (s as FakeStmt).exec<T>());
      this.raw.exec('COMMIT');
      return out;
    } catch (e) { this.raw.exec('ROLLBACK'); throw e; }
  }
}
