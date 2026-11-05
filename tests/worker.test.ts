import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { etagMatches, handleApi, safeNext, type ApiCtx, type ApiEnv } from '../worker/api.ts';
import { SCHEMA } from '../worker/schema.ts';
import { makePack, packHash } from '../src/data/pack.ts';
import type { VEvent } from '../src/engine/events.ts';
import type { GetEventsResponse, PackStatus, PostEventsResponse } from '../src/sync/protocol.ts';
import { FIX_WHEELOCK } from './fixtures.ts';
import { FakeD1 } from './d1fake.ts';

const AUD = 'test-aud';
const EMAIL = 'joshua.a.wallin@gmail.com';
const BASE = 'https://vocabula.example';

function ctxFor(email: string | undefined, aud = AUD): ApiCtx {
  return { access: { aud, getIdentity: async () => (email === undefined ? undefined : { email }) } };
}

let db: FakeD1;
let env: ApiEnv;
const ok = ctxFor(EMAIL);

function call(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; ctx?: ApiCtx } = {}) {
  const init: RequestInit = { method, headers: { ...(opts.headers ?? {}) } };
  if (opts.body !== undefined) init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  return handleApi(new Request(BASE + path, init), env, 'ctx' in opts ? opts.ctx : ok);
}

const pack = () => makePack(FIX_WHEELOCK, [1, 2, 3, 4], new Date('2026-11-01T00:00:00Z'));
const ev = (id: string, ts: number, extra: Partial<VEvent> = {}): VEvent =>
  ({ id, device: 'phone', ts, kind: 'review', card: 'ambulo-v1:meaning', grade: 'good', ...extra });

beforeEach(() => {
  db = new FakeD1();
  env = { DB: db, ALLOWED_EMAILS: ` ${EMAIL.toUpperCase()} , other@example.com`, ACCESS_AUD: AUD };
});

describe('worker: access', () => {
  it('403 without ctx.access, without identity, wrong email or wrong aud', async () => {
    for (const ctx of [undefined, {}, ctxFor(undefined), ctxFor('mallory@example.com'), ctxFor(EMAIL, 'other-aud')]) {
      const r = await call('GET', '/api/me', { ctx });
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ error: 'forbidden' });
    }
    // getIdentity throwing is also a 403, not a 500.
    const r = await call('GET', '/api/events', { ctx: { access: { aud: AUD, getIdentity: async () => { throw new Error('boom'); } } } });
    expect(r.status).toBe(403);
    // No ACCESS_AUD configured → nothing is allowed.
    env.ACCESS_AUD = undefined;
    expect((await call('GET', '/api/me')).status).toBe(403);
  });
  it('GET /api/me returns the email (case-insensitive allow list)', async () => {
    const r = await call('GET', '/api/me', { ctx: ctxFor('Joshua.A.Wallin@gmail.com') });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ email: EMAIL });
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('GET /api/me?return= redirects back into the app, same-origin paths only', async () => {
    const r = await call('GET', '/api/me?return=/');
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/');
    expect(safeNext('//evil.example/')).toBe('/');
    expect(safeNext('https://evil.example/')).toBe('/');
    expect(safeNext('/\\evil')).toBe('/');
    expect(safeNext('/path?x=1')).toBe('/path?x=1');
    // Unauthenticated: no redirect.
    expect((await call('GET', '/api/me?return=/', { ctx: undefined })).status).toBe(403);
  });
  it('unknown routes 404, wrong methods 405', async () => {
    expect((await call('GET', '/api/nope')).status).toBe(404);
    expect((await call('DELETE', '/api/pack')).status).toBe(405);
  });
});

describe('worker: pack', () => {
  it('404 before upload; status says absent', async () => {
    const r = await call('GET', '/api/pack');
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'no pack' });
    expect(await (await call('GET', '/api/pack/status')).json()).toEqual({ present: false });
  });
  it('PUT validates with the client validator', async () => {
    const bad = await call('PUT', '/api/pack', { body: { ...pack(), schema: 99 } });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { error: string }).error).toMatch(/schema/);
    expect((await call('PUT', '/api/pack', { body: '{not json' })).status).toBe(400);
    expect((await call('PUT', '/api/pack', { body: { format: 'x' } })).status).toBe(422);
  });
  it('PUT rejects bodies over 2 MB', async () => {
    const big = JSON.stringify({ ...pack(), pad: 'x'.repeat(2 * 1024 * 1024) });
    expect((await call('PUT', '/api/pack', { body: big })).status).toBe(413);
  });
  it('PUT then GET with ETag; If-None-Match → 304; replace changes the hash', async () => {
    const p = pack();
    const put = await call('PUT', '/api/pack', { body: p });
    expect(put.status).toBe(200);
    const hash = await packHash(p);
    expect(await put.json()).toMatchObject({ hash, id: p.id, lemmas: p.counts.lemmas });

    const get = await call('GET', '/api/pack');
    expect(get.status).toBe(200);
    expect(get.headers.get('etag')).toBe(`"${hash}"`);
    expect(await get.json()).toEqual(p);

    const st = (await (await call('GET', '/api/pack/status')).json()) as PackStatus;
    expect(st).toMatchObject({ present: true, hash, id: p.id, lemmas: p.counts.lemmas });

    const nm = await call('GET', '/api/pack', { headers: { 'if-none-match': `"${hash}"` } });
    expect(nm.status).toBe(304);
    expect(await nm.text()).toBe('');
    expect((await call('GET', '/api/pack', { headers: { 'if-none-match': '"stale"' } })).status).toBe(200);

    const p2 = { ...p, builtAt: '2026-11-04T00:00:00.000Z' };
    await call('PUT', '/api/pack', { body: p2 });
    const g2 = await call('GET', '/api/pack', { headers: { 'if-none-match': `"${hash}"` } });
    expect(g2.status).toBe(200);
    expect(g2.headers.get('etag')).toBe(`"${await packHash(p2)}"`);
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM packs').all()[0] as { n: number }).n).toBe(1);
  });
  it('etagMatches handles weak and lists', () => {
    expect(etagMatches('W/"abc", "def"', 'def')).toBe(true);
    expect(etagMatches('"abc"', 'def')).toBe(false);
    expect(etagMatches(null, 'def')).toBe(false);
  });
});

describe('worker: events', () => {
  const post = async (events: unknown[]) => call('POST', '/api/events', { body: { events } });
  const pull = async (q = '') => (await (await call('GET', `/api/events${q}`)).json()) as GetEventsResponse;

  it('stores an event once even when posted twice (idempotent by id)', async () => {
    const a = ev('a', 1000, { body: { node: 's1.verba.1', run: 'r1' } });
    const r1 = (await (await post([a, ev('b', 2000)])).json()) as PostEventsResponse;
    expect(r1).toEqual({ accepted: 2, cursor: 2 });
    const r2 = (await (await post([a, a, ev('c', 500)])).json()) as PostEventsResponse;
    expect(r2.accepted).toBe(1);
    const all = await pull();
    expect(all.events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(all.events[0]).toEqual({ ...a, seq: 1 });
    expect(all.more).toBe(false);
    // Ignored duplicates may burn AUTOINCREMENT values: seq is increasing, not dense.
    expect(r2.cursor).toBe(all.events[2]!.seq);
    expect(all.cursor).toBe(r2.cursor);
  });
  it('drops device-local fields and keeps the client shape', async () => {
    await post([{ ...ev('x', 1), outbox: 1 }, { id: 'n', device: 'd', ts: 2, kind: 'node_done', body: { node: 'n1', run: 'r', stats: { exercises: 1, graded: 1, firstTryCorrect: 1, newWords: [], reviews: 1 } } }]);
    const { events } = await pull();
    expect(events[0]).toEqual({ ...ev('x', 1), seq: 1 });
    expect('outbox' in events[0]!).toBe(false);
    expect(events[1]).toMatchObject({ id: 'n', kind: 'node_done', body: { node: 'n1' } });
    expect('card' in events[1]! || 'grade' in events[1]!).toBe(false);
  });
  it('validates events and the per-request limit', async () => {
    expect((await post([{ id: 'x', device: 'd', ts: 'soon', kind: 'review' }])).status).toBe(422);
    expect((await post([{ id: 'x', device: 'd', ts: 1, kind: 'hack' }])).status).toBe(422);
    expect((await post([{ ...ev('x', 1), grade: 3 }])).status).toBe(422);
    expect((await call('POST', '/api/events', { body: { nope: [] } })).status).toBe(400);
    expect((await post(Array.from({ length: 501 }, (_, i) => ev(`e${i}`, i)))).status).toBe(413);
    // Nothing from a rejected batch is stored.
    expect((await pull()).events).toEqual([]);
    const okr = (await (await post(Array.from({ length: 500 }, (_, i) => ev(`e${i}`, i)))).json()) as PostEventsResponse;
    expect(okr.accepted).toBe(500);
  });
  it('paginates with after/limit; cursor and more', async () => {
    await post(Array.from({ length: 25 }, (_, i) => ev(`e${String(i).padStart(2, '0')}`, 1000 - i)));
    const p1 = await pull('?after=0&limit=10');
    expect(p1.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(p1).toMatchObject({ cursor: 10, more: true });
    const p2 = await pull(`?after=${p1.cursor}&limit=10`);
    expect(p2).toMatchObject({ cursor: 20, more: true });
    const p3 = await pull(`?after=${p2.cursor}&limit=10`);
    expect(p3.events.length).toBe(5);
    expect(p3).toMatchObject({ cursor: 25, more: false });
    const p4 = await pull(`?after=${p3.cursor}`);
    expect(p4).toEqual({ events: [], cursor: 25, more: false });
    // limit is clamped to [1, 1000]; junk is a 400.
    expect((await pull('?limit=0')).events.length).toBe(1);
    expect((await call('GET', '/api/events?after=abc')).status).toBe(400);
  });
  it('creates the schema once per database object', async () => {
    await call('GET', '/api/events');
    await call('GET', '/api/events');
    await call('GET', '/api/pack/status');
    expect(db.calls.filter((q) => q.startsWith('CREATE TABLE')).length).toBe(SCHEMA.length);
  });
});

describe('schema', () => {
  it('migrations/*.sql, in order, match worker/schema.ts', () => {
    const sql = ['0001_init.sql', '0002_audio.sql', '0004_audio_flags.sql'].map((f) => readFileSync(resolve(__dirname, '../migrations', f), 'utf8')).join('\n');
    const stmts = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
    expect(stmts).toEqual(SCHEMA.map((s) => s.trim()));
  });
});

describe('worker: Access JWT fallback (no ctx.access)', () => {
  it('accepts a valid Access JWT from the header or cookie and rejects bad ones', async () => {
    const { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } = await import('jose');
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    env.ACCESS_JWKS = createLocalJWKSet({ keys: [jwk] });
    env.ACCESS_TEAM_DOMAIN = 'team.cloudflareaccess.com';
    const sign = (claims: Record<string, unknown>, aud = AUD, iss = 'https://team.cloudflareaccess.com') =>
      new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setAudience(aud).setIssuer(iss)
        .setIssuedAt().setExpirationTime('1h').sign(privateKey);

    const good = await sign({ email: EMAIL });
    let r = await call('GET', '/api/me', { ctx: {}, headers: { 'cf-access-jwt-assertion': good } });
    expect(r.status).toBe(200);
    r = await call('GET', '/api/me', { ctx: {}, headers: { cookie: `x=1; CF_Authorization=${good}` } });
    expect(r.status).toBe(200);

    const cases: [string, string][] = [
      [await sign({ email: EMAIL }, 'other-aud'), 'jwt_invalid'],
      [await sign({ email: EMAIL }, AUD, 'https://evil.example'), 'jwt_invalid'],
      [await sign({ email: 'stranger@example.com' }), 'email_not_allowed'],
      [good.slice(0, -4) + 'AAAA', 'jwt_invalid'],
    ];
    for (const [tok, reason] of cases) {
      r = await call('GET', '/api/me', { ctx: {}, headers: { 'cf-access-jwt-assertion': tok } });
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ reason });
    }
    r = await call('GET', '/api/me', { ctx: {} });
    expect(await r.json()).toMatchObject({ reason: 'no_access_context' });
  });
});
