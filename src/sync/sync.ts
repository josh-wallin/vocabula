/**
 * Event sync with the Worker: push the outbox, pull everything after the stored
 * cursor, merge by event id. Derived state is a replay sorted by (ts, id)
 * (engine/events.ts), so every device that holds the same set of events shows
 * the same state, whatever order they arrived in.
 */
import { canonical, type VEvent } from '../engine/events.ts';
import { parseEvent, wireEvent } from '../engine/eventShape.ts';
import { apiFetch, type ApiFailure, type FetchFn } from './http.ts';
import { API, DEFAULT_PULL_LIMIT, MAX_EVENTS_PER_POST, type GetEventsResponse, type PostEventsResponse } from './protocol.ts';

export interface SyncStore {
  /** Events not yet accepted by the server. */
  outbox(): Promise<VEvent[]>;
  markSent(ids: readonly string[]): Promise<void>;
  /** Append server events not already present (by id), marked as sent. Returns how many were new. */
  addRemote(events: readonly VEvent[]): Promise<number>;
  getCursor(): Promise<number>;
  setCursor(cursor: number): Promise<void>;
}

export type SyncOutcome =
  | { kind: 'ok'; pushed: number; pulled: number }
  | (ApiFailure & { pushed: number; pulled: number });

const MAX_PAGES = 10_000;

export async function syncOnce(store: SyncStore, fetchFn?: FetchFn): Promise<SyncOutcome> {
  let pushed = 0;
  let pulled = 0;
  const fail = (r: ApiFailure): SyncOutcome => ({ ...r, pushed, pulled });

  // Push, oldest first, in chunks. Each chunk is marked sent only after a 2xx.
  const out = canonical(await store.outbox());
  for (let i = 0; i < out.length; i += MAX_EVENTS_PER_POST) {
    const chunk = out.slice(i, i + MAX_EVENTS_PER_POST);
    const r = await apiFetch<PostEventsResponse>(API.events, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: chunk.map(wireEvent) }),
    }, fetchFn);
    if (r.kind !== 'ok') return fail(r.kind === 'not-modified' ? { kind: 'error', status: 304, message: 'Unexpected 304' } : r);
    await store.markSent(chunk.map((e) => e.id));
    pushed += chunk.length;
  }

  // Pull until the server says there's no more.
  let cursor = await store.getCursor();
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await apiFetch<GetEventsResponse>(`${API.events}?after=${cursor}&limit=${DEFAULT_PULL_LIMIT}`, {}, fetchFn);
    if (r.kind !== 'ok') return fail(r.kind === 'not-modified' ? { kind: 'error', status: 304, message: 'Unexpected 304' } : r);
    const { events, cursor: next, more } = r.data;
    if (!Array.isArray(events) || typeof next !== 'number') return fail({ kind: 'error', status: 200, message: 'Malformed events page' });
    const valid: VEvent[] = [];
    events.forEach((e, i) => { try { valid.push(parseEvent(e, i)); } catch { /* skip a bad record rather than stall sync */ } });
    pulled += await store.addRemote(valid);
    if (next > cursor) { cursor = next; await store.setCursor(cursor); }
    if (!more || events.length === 0) break;
  }
  return { kind: 'ok', pushed, pulled };
}

/* ---------------- loop ---------------- */

export type SyncState = 'idle' | 'offline' | 'syncing' | 'synced' | 'queued' | 'auth' | 'error';
export interface SyncStatus { state: SyncState; queued: number; lastSync?: number; message?: string }

export interface SyncerOptions {
  store: SyncStore;
  fetch?: FetchFn;
  isOnline?: () => boolean;
  isVisible?: () => boolean;
  /** Called after a sync that brought in new events (re-replay state). */
  onPulled?: (n: number) => void;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
  now?: () => number;
}

export const PERIOD_MS = 5 * 60_000;
export const BACKOFF_BASE_MS = 15_000;
export const BACKOFF_MAX_MS = 15 * 60_000;

export const backoffDelay = (failures: number): number =>
  Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));

/** Chip text for a status. */
export function syncLabel(s: SyncStatus): string {
  switch (s.state) {
    case 'offline': return 'Offline';
    case 'syncing': return 'Syncing…';
    case 'auth': return 'Sign in';
    case 'synced': return 'Synced';
    case 'idle':
    case 'queued':
    case 'error': return s.queued > 0 ? `${s.queued} queued` : s.state === 'queued' ? 'Synced' : 'Not synced';
  }
}

/**
 * Runs syncOnce on start, `online`, becoming visible, explicit requests (e.g.
 * after a lesson) and every 5 minutes while visible. Failures back off
 * exponentially; nothing is ever thrown to the caller.
 */
export class Syncer {
  status: SyncStatus = { state: 'idle', queued: 0 };
  private listeners = new Set<(s: SyncStatus) => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private retry: unknown = null;
  private period: unknown = null;
  private detach: (() => void) | null = null;
  private readonly o: Required<Omit<SyncerOptions, 'fetch' | 'onPulled'>> & Pick<SyncerOptions, 'fetch' | 'onPulled'>;

  constructor(opts: SyncerOptions) {
    this.o = {
      isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
      isVisible: () => (typeof document === 'undefined' ? true : document.visibilityState === 'visible'),
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
      now: () => Date.now(),
      ...opts,
    };
  }

  /** Replace the onPulled callback (the UI sets it once its state is ready). */
  setOnPulled(fn: ((n: number) => void) | undefined): void { this.o.onPulled = fn; }

  subscribe(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private set(s: Partial<SyncStatus>) {
    this.status = { ...this.status, ...s };
    for (const l of this.listeners) l(this.status);
  }

  /** Re-read the outbox size (after recording events) without syncing. */
  async refreshQueued(): Promise<void> {
    try {
      const queued = (await this.o.store.outbox()).length;
      const st = this.status.state;
      const state: SyncState = st === 'synced' && queued > 0 ? 'queued' : st;
      this.set({ queued, state });
    } catch { /* ignore */ }
  }

  /** Sync now (coalesced with a run in progress). Resolves when done; never rejects. */
  request(): Promise<void> {
    if (this.running) { this.again = true; return this.running; }
    this.running = this.loop().finally(() => { this.running = null; });
    return this.running;
  }

  private async loop(): Promise<void> {
    do {
      this.again = false;
      await this.runOnce();
    } while (this.again);
  }

  private async runOnce(): Promise<void> {
    if (this.retry !== null) { this.o.clearTimeout(this.retry); this.retry = null; }
    if (!this.o.isOnline()) {
      await this.refreshQueued();
      this.set({ state: 'offline' });
      return;
    }
    this.set({ state: 'syncing' });
    let r: SyncOutcome;
    try { r = await syncOnce(this.o.store, this.o.fetch); } catch (e) {
      r = { kind: 'error', status: 0, message: (e as Error).message, pushed: 0, pulled: 0 };
    }
    let queued = this.status.queued;
    try { queued = (await this.o.store.outbox()).length; } catch { /* keep */ }
    if (r.pulled > 0) { try { this.o.onPulled?.(r.pulled); } catch { /* UI callback */ } }
    if (r.kind === 'ok') {
      this.failures = 0;
      this.set({ state: queued > 0 ? 'queued' : 'synced', queued, lastSync: this.o.now(), message: undefined });
      return;
    }
    if (r.kind === 'offline' && !this.o.isOnline()) { this.set({ state: 'offline', queued }); return; }
    if (r.kind === 'auth') {
      // Needs the user: retry only on the next trigger.
      this.set({ state: 'auth', queued, message: 'Sign in again to sync.' });
      return;
    }
    this.failures++;
    this.set({ state: 'error', queued, message: 'message' in r ? r.message : 'Server unreachable' });
    this.retry = this.o.setTimeout(() => { this.retry = null; void this.request(); }, backoffDelay(this.failures));
  }

  /** Wire up browser triggers and the 5-minute timer; returns stop(). */
  start(): () => void {
    if (this.detach) return this.detach;
    const tick = () => {
      this.period = this.o.setTimeout(() => {
        if (this.o.isVisible()) void this.request();
        tick();
      }, PERIOD_MS);
    };
    const onOnline = () => void this.request();
    const onOffline = () => this.set({ state: 'offline' });
    const onVisible = () => { if (this.o.isVisible()) void this.request(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    tick();
    void this.request();
    this.detach = () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (this.period !== null) this.o.clearTimeout(this.period);
      if (this.retry !== null) this.o.clearTimeout(this.retry);
      this.period = this.retry = null;
      this.detach = null;
    };
    return this.detach;
  }
}
