import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { fetchPackFromServer, importPack, loadContent, serverPackStatus, uploadPackToServer } from '../src/data/contentStore.ts';
import { allEvents, getPackRecord, putEvents } from '../src/data/db.ts';
import { makePack, packHash } from '../src/data/pack.ts';
import { idbSyncStore } from '../src/sync/idbStore.ts';
import { syncOnce } from '../src/sync/sync.ts';
import type { FetchFn } from '../src/sync/http.ts';
import { handleApi, type ApiEnv } from '../worker/api.ts';
import { FIX_WHEELOCK } from './fixtures.ts';
import { FakeD1 } from './d1fake.ts';

const env: ApiEnv = { DB: new FakeD1(), ALLOWED_EMAILS: 'me@example.com', ACCESS_AUD: 'a' };
let calls: { method: string; url: string; inm: string | null; status: number }[] = [];
const server: FetchFn = async (u, init) => {
  const req = new Request(`https://v.test${u}`, init);
  const res = await handleApi(req, env, { access: { aud: 'a', getIdentity: async () => ({ email: 'me@example.com' }) } });
  calls.push({ method: req.method, url: u, inm: req.headers.get('if-none-match'), status: res.status });
  return res;
};

// One IndexedDB per file: the steps below run in order.
describe('content store ↔ server (IndexedDB)', () => {
  const p1 = makePack(FIX_WHEELOCK, [1, 2, 3, 4], new Date('2026-11-01T00:00:00Z'));
  const p2 = { ...p1, builtAt: '2026-11-02T00:00:00.000Z' };

  it('reports a missing server pack, then uploads the file-imported pack', async () => {
    expect(await fetchPackFromServer(server)).toMatchObject({ kind: 'missing' });
    expect(await serverPackStatus(server)).toEqual({ kind: 'ok', data: { present: false } });
    await importPack(JSON.stringify(p1));
    expect((await getPackRecord())?.hash).toBe(await packHash(p1));
    await putEvents([{ id: 'e1', device: 'me', ts: 1, kind: 'node_done', body: { node: 's1.verba.1', run: 'r', stats: { exercises: 1, graded: 1, firstTryCorrect: 1, newWords: [], reviews: 1 } }, outbox: 1 }]);
    const up = await uploadPackToServer(server);
    expect(up).toMatchObject({ kind: 'ok', data: { hash: await packHash(p1) } });
    const st = await serverPackStatus(server);
    expect(st).toMatchObject({ kind: 'ok', data: { present: true, hash: await packHash(p1) } });
  });

  it('sends If-None-Match and gets 304 when unchanged', async () => {
    calls = [];
    expect(await fetchPackFromServer(server)).toEqual({ kind: 'unchanged' });
    expect(calls[0]).toMatchObject({ method: 'GET', url: '/api/pack', inm: `"${await packHash(p1)}"`, status: 304 });
  });

  it('stores a newer server pack and keeps progress', async () => {
    await env.DB.prepare("UPDATE packs SET body = ?1, hash = ?2").bind(JSON.stringify(p2), await packHash(p2)).run();
    const r = await fetchPackFromServer(server);
    expect(r.kind).toBe('updated');
    const rec = await getPackRecord();
    expect(rec).toMatchObject({ source: 'server', hash: await packHash(p2) });
    expect(rec!.pack.builtAt).toBe(p2.builtAt);
    expect((await allEvents()).map((e) => e.id)).toEqual(['e1']);
    expect((await loadContent())?.pack.builtAt).toBe(p2.builtAt);
  });

  it('keeps a newer local pack rather than downgrading', async () => {
    await env.DB.prepare("UPDATE packs SET body = ?1, hash = ?2").bind(JSON.stringify(p1), await packHash(p1)).run();
    expect(await fetchPackFromServer(server)).toEqual({ kind: 'kept-local' });
    expect((await getPackRecord())!.pack.builtAt).toBe(p2.builtAt);
  });

  it('expired session and offline are reported, not thrown', async () => {
    const opaque: FetchFn = async () => ({ type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() } as unknown as Response);
    expect(await fetchPackFromServer(opaque)).toEqual({ kind: 'auth' });
    expect(await uploadPackToServer(opaque)).toEqual({ kind: 'auth' });
    const down: FetchFn = async () => { throw new TypeError('Failed to fetch'); };
    expect(await fetchPackFromServer(down)).toEqual({ kind: 'offline' });
  });

  it('the IndexedDB sync store pushes the outbox, clears it and persists the cursor', async () => {
    expect((await idbSyncStore.outbox()).map((e) => e.id)).toEqual(['e1']);
    // Another device's event is on the server.
    await server('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: [{ id: 'r1', device: 'other', ts: 2, kind: 'review', card: 'x:meaning', grade: 'good' }] }) });
    expect(await syncOnce(idbSyncStore, server)).toMatchObject({ kind: 'ok', pushed: 1, pulled: 1 });
    expect(await idbSyncStore.outbox()).toEqual([]);
    expect(await idbSyncStore.getCursor()).toBe(2);
    const evs = await allEvents();
    expect(evs.map((e) => [e.id, e.outbox])).toEqual([['e1', 0], ['r1', 0]]);
  });
});
