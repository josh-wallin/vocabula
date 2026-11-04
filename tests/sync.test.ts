import { beforeEach, describe, expect, it } from 'vitest';
import { canonical, replay, stateFingerprint, type VEvent } from '../src/engine/events.ts';
import { rng, shuffle } from '../src/engine/util.ts';
import { apiFetch, type FetchFn } from '../src/sync/http.ts';
import { backoffDelay, syncLabel, syncOnce, Syncer, type SyncStore } from '../src/sync/sync.ts';
import { handleApi, type ApiEnv } from '../worker/api.ts';
import { FakeD1 } from './d1fake.ts';

const AUD = 'aud';
const EMAIL = 'joshua.a.wallin@gmail.com';

/** A device: an event log in memory with outbox flags and a cursor. */
class MemDevice implements SyncStore {
  events = new Map<string, VEvent>();
  cursor = 0;
  constructor(readonly name: string) {}
  record(e: Omit<VEvent, 'device' | 'outbox'>) { this.events.set(e.id, { ...e, device: this.name, outbox: 1 }); }
  async outbox() { return [...this.events.values()].filter((e) => e.outbox === 1); }
  async markSent(ids: readonly string[]) { for (const id of ids) { const e = this.events.get(id); if (e) e.outbox = 0; } }
  async addRemote(evs: readonly VEvent[]) {
    let n = 0;
    for (const e of evs) if (!this.events.has(e.id)) { this.events.set(e.id, { ...e, outbox: 0 }); n++; }
    return n;
  }
  async getCursor() { return this.cursor; }
  async setCursor(c: number) { this.cursor = c; }
  state() { return stateFingerprint(replay([...this.events.values()])); }
}

let env: ApiEnv;
let authOk = true;
/** fetch backed by the real Worker handlers over an in-memory D1. */
const serverFetch: FetchFn = async (input, init) => {
  const ctx = authOk ? { access: { aud: AUD, getIdentity: async () => ({ email: EMAIL }) } } : undefined;
  return handleApi(new Request(`https://vocabula.test${input}`, init), env, ctx);
};

beforeEach(() => {
  env = { DB: new FakeD1(), ALLOWED_EMAILS: EMAIL, ACCESS_AUD: AUD };
  authOk = true;
});

const T = Date.parse('2026-11-04T08:00:00Z');
const cards = ['ambulo-v1:meaning', 'habito-v1:meaning', 'casa-n1:forms:n1', 'ambulo-v1:class'];

function practise(d: MemDevice, seed: number, n: number, t0: number) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const id = `${d.name}-${seed}-${i}`;
    d.record({ id, ts: t0 + Math.floor(r() * 3600_000), kind: 'review', card: cards[Math.floor(r() * cards.length)]!, grade: r() < 0.7 ? 'good' : 'again' });
  }
  d.record({ id: `${d.name}-${seed}-done`, ts: t0 + 3600_000, kind: 'node_done', body: { node: `s1.verba.${seed}`, run: `run${seed}`, stats: { exercises: n, graded: n, firstTryCorrect: 0, newWords: [], reviews: n } } });
}

describe('sync: two devices converge', () => {
  it('to identical replayed state after exchanging events in different orders', async () => {
    const phone = new MemDevice('phone');
    const laptop = new MemDevice('laptop');
    practise(phone, 1, 30, T);
    practise(laptop, 2, 40, T + 1800_000); // interleaved timestamps
    // Same ts on both devices: tie broken by id.
    phone.record({ id: 'tie-z', ts: T, kind: 'review', card: cards[0]!, grade: 'again' });
    laptop.record({ id: 'tie-a', ts: T, kind: 'review', card: cards[0]!, grade: 'good' });

    expect(phone.state()).not.toBe(laptop.state());
    // Laptop pushes first, then phone; then laptop again to pull the phone's events.
    expect((await syncOnce(laptop, serverFetch)).kind).toBe('ok');
    const rp = await syncOnce(phone, serverFetch);
    expect(rp).toMatchObject({ kind: 'ok', pushed: 32, pulled: 42 });
    expect((await syncOnce(laptop, serverFetch))).toMatchObject({ kind: 'ok', pushed: 0, pulled: 32 });

    expect(phone.events.size).toBe(74);
    expect(laptop.events.size).toBe(74);
    expect(phone.state()).toBe(laptop.state());
    // ...and the same as replaying the union in any order on a fresh device.
    const union = shuffle([...phone.events.values()], rng(7));
    expect(stateFingerprint(replay(union))).toBe(phone.state());
    expect(await phone.outbox()).toEqual([]);
    expect(await laptop.outbox()).toEqual([]);

    // A third device starting from scratch pages through everything and agrees.
    const tablet = new MemDevice('tablet');
    expect(await syncOnce(tablet, serverFetch)).toMatchObject({ kind: 'ok', pulled: 74 });
    expect(tablet.state()).toBe(phone.state());
    expect(tablet.cursor).toBeGreaterThan(0);
    // Idempotent: nothing new on a second pass.
    expect(await syncOnce(tablet, serverFetch)).toMatchObject({ kind: 'ok', pushed: 0, pulled: 0 });
  });

  it('pushes more than 500 events in chunks and pulls across pages', async () => {
    const a = new MemDevice('a');
    practise(a, 3, 1200, T);
    const calls: string[] = [];
    const counting: FetchFn = (u, i) => { calls.push(`${i?.method ?? 'GET'} ${u}`); return serverFetch(u, i); };
    expect(await syncOnce(a, counting)).toMatchObject({ kind: 'ok', pushed: 1201 });
    expect(calls.filter((c) => c.startsWith('POST')).length).toBe(3);
    const b = new MemDevice('b');
    calls.length = 0;
    expect(await syncOnce(b, counting)).toMatchObject({ kind: 'ok', pulled: 1201 });
    expect(calls.filter((c) => c.startsWith('GET')).length).toBe(2);
    expect(b.state()).toBe(a.state());
  });
});

describe('sync: outbox and failures', () => {
  it('marks the outbox sent only after a 2xx', async () => {
    const d = new MemDevice('d');
    practise(d, 4, 5, T);
    const err: FetchFn = async () => new Response(JSON.stringify({ error: 'down' }), { status: 503, headers: { 'content-type': 'application/json' } });
    expect(await syncOnce(d, err)).toMatchObject({ kind: 'error', status: 503, pushed: 0 });
    expect((await d.outbox()).length).toBe(6);
    const net: FetchFn = async () => { throw new TypeError('Failed to fetch'); };
    expect((await syncOnce(d, net)).kind).toBe('offline');
    expect((await d.outbox()).length).toBe(6);
    // Second chunk fails: only the first chunk is marked sent.
    practise(d, 5, 600, T);
    let posts = 0;
    const flaky: FetchFn = (u, i) => (i?.method === 'POST' && ++posts === 2 ? err(u, i) : serverFetch(u, i));
    expect(await syncOnce(d, flaky)).toMatchObject({ kind: 'error', pushed: 500 });
    expect((await d.outbox()).length).toBe(607 - 500);
    expect(await syncOnce(d, serverFetch)).toMatchObject({ kind: 'ok', pushed: 107 });
    expect((await d.outbox()).length).toBe(0);
  });

  it('treats an expired Access session as auth, without throwing or marking sent', async () => {
    const d = new MemDevice('d');
    practise(d, 6, 3, T);
    const opaque = { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() } as unknown as Response;
    const shapes: FetchFn[] = [
      async () => opaque,
      async () => new Response(null, { status: 302, headers: { location: 'https://long-credit-c585.cloudflareaccess.com/cdn-cgi/access/login' } }),
      async () => new Response('<!doctype html><title>Sign in</title>', { status: 200, headers: { 'content-type': 'text/html' } }),
      async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } }),
      async () => new Response('', { status: 401 }),
    ];
    for (const f of shapes) {
      expect((await syncOnce(d, f)).kind).toBe('auth');
      expect((await d.outbox()).length).toBe(4);
    }
    // The real Worker without an identity is also "auth".
    authOk = false;
    expect((await syncOnce(d, serverFetch)).kind).toBe('auth');
    expect((await apiFetch('/api/me', {}, serverFetch)).kind).toBe('auth');
  });

  it('skips malformed server events instead of stalling', async () => {
    const d = new MemDevice('d');
    const page = { events: [{ seq: 1, id: 'ok', device: 'x', ts: 5, kind: 'review', card: 'a:meaning', grade: 'good' }, { seq: 2, id: 'bad', ts: 'x' }], cursor: 2, more: false };
    const f: FetchFn = async () => new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } });
    expect(await syncOnce(d, f)).toMatchObject({ kind: 'ok', pulled: 1 });
    expect(d.cursor).toBe(2);
    expect([...d.events.keys()]).toEqual(['ok']);
  });
});

describe('Syncer loop', () => {
  function manualTimers() {
    const timers: { fn: () => void; ms: number; id: number }[] = [];
    let id = 0;
    const fire = (ms: number) => {
      const i = timers.findIndex((x) => x.ms === ms);
      const [tm] = timers.splice(i, 1);
      tm!.fn();
    };
    return {
      timers, fire,
      setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms, id: ++id }); return id; },
      clearTimeout: (h: unknown) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    };
  }

  it('reports statuses, backs off on failure and never rejects', async () => {
    const d = new MemDevice('d');
    practise(d, 8, 2, T);
    let mode: 'down' | 'up' | 'auth' = 'down';
    const f: FetchFn = async (u, i) => {
      if (mode === 'down') return new Response('{"error":"x"}', { status: 500, headers: { 'content-type': 'application/json' } });
      if (mode === 'auth') return { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() } as unknown as Response;
      return serverFetch(u, i);
    };
    const t = manualTimers();
    let online = true;
    let pulledCalls = 0;
    const s = new Syncer({ store: d, fetch: f, isOnline: () => online, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, onPulled: () => pulledCalls++ });
    const seen: string[] = [];
    s.subscribe((st) => seen.push(syncLabel(st)));

    await s.request();
    expect(s.status).toMatchObject({ state: 'error', queued: 3 });
    expect(syncLabel(s.status)).toBe('3 queued');
    expect(t.timers.map((x) => x.ms)).toEqual([backoffDelay(1)]);
    await s.request(); // a manual trigger replaces the pending retry
    expect(t.timers.map((x) => x.ms)).toEqual([backoffDelay(2)]);
    expect(backoffDelay(2)).toBe(2 * backoffDelay(1));
    expect(backoffDelay(50)).toBe(15 * 60_000);

    mode = 'auth';
    await s.request();
    expect(s.status.state).toBe('auth');
    expect(syncLabel(s.status)).toBe('Sign in');
    expect(t.timers).toEqual([]); // waits for the user

    online = false;
    await s.request();
    expect(syncLabel(s.status)).toBe('Offline');

    online = true; mode = 'up';
    // Another device's event is waiting on the server.
    const other = new MemDevice('other');
    other.record({ id: 'remote-1', ts: T + 5, kind: 'review', card: cards[1]!, grade: 'good' });
    await syncOnce(other, serverFetch);
    await s.request();
    expect(s.status).toMatchObject({ state: 'synced', queued: 0 });
    expect(syncLabel(s.status)).toBe('Synced');
    expect(pulledCalls).toBe(1);
    expect(d.events.has('remote-1')).toBe(true);
    expect(seen).toContain('Syncing…');
  });

  it('coalesces overlapping requests', async () => {
    const d = new MemDevice('d');
    let calls = 0;
    const f: FetchFn = (u, i) => { calls++; return serverFetch(u, i); };
    const s = new Syncer({ store: d, fetch: f, isOnline: () => true });
    await Promise.all([s.request(), s.request(), s.request()]);
    // One run plus at most one re-run, each a single GET (empty outbox).
    expect(calls).toBeLessThanOrEqual(2);
  });

  it('start() syncs at once and every 5 minutes while visible', async () => {
    const d = new MemDevice('d');
    const t = manualTimers();
    let visible = true;
    let gets = 0;
    const f: FetchFn = (u, i) => { gets++; return serverFetch(u, i); };
    const s = new Syncer({ store: d, fetch: f, isOnline: () => true, isVisible: () => visible, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout });
    const stop = s.start();
    await s.request();
    const before = gets;
    t.fire(5 * 60_000);
    await s.request();
    expect(gets).toBeGreaterThan(before);
    visible = false;
    const n = gets;
    t.fire(5 * 60_000);
    await Promise.resolve();
    expect(gets).toBe(n);
    stop();
    expect(t.timers).toEqual([]);
  });
});

describe('canonical order is arrival-independent', () => {
  it('sorts by (ts, id)', () => {
    const evs: VEvent[] = [
      { id: 'b', device: 'x', ts: 1, kind: 'setting', body: { key: 'k', value: 1 } },
      { id: 'a', device: 'y', ts: 1, kind: 'setting', body: { key: 'k', value: 2 } },
    ];
    expect(canonical(evs).map((e) => e.id)).toEqual(['a', 'b']);
    expect(replay(evs).settings.k).toBe(1);
    expect(replay([...evs].reverse()).settings.k).toBe(1);
  });
});
