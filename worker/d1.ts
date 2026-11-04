/**
 * The subset of the D1 API the sync handlers use. Real `D1Database` satisfies it
 * (checked in worker/index.ts under the Workers types); tests pass a small fake
 * over node:sqlite.
 */
export interface D1Meta { changes?: number; last_row_id?: number }
export interface D1Res<T> { results: T[]; success: boolean; meta: D1Meta }
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Res<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Res<T>>;
}
export interface D1Like {
  prepare(query: string): D1Stmt;
  batch<T = unknown>(statements: D1Stmt[]): Promise<D1Res<T>[]>;
}
