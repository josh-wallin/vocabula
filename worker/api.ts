/**
 * /api/* handlers. Every route requires a Cloudflare Access identity whose
 * application audience matches ACCESS_AUD and whose email is in ALLOWED_EMAILS.
 */
import { parsePack, packHash, packText } from '../src/data/pack.ts';
import { parseEvent } from '../src/engine/eventShape.ts';
import type { VEvent } from '../src/engine/events.ts';
import {
  API, DEFAULT_PULL_LIMIT, MAX_EVENTS_BODY_BYTES, MAX_EVENTS_PER_POST, MAX_PACK_BYTES, MAX_PULL_LIMIT,
  type GetEventsResponse, type PackStatus, type PostEventsResponse, type PutPackResponse, type ServerEvent,
} from '../src/sync/protocol.ts';
import type { D1Like } from './d1.ts';
import { ensureSchema } from './schema.ts';

export interface ApiEnv {
  DB: D1Like;
  ALLOWED_EMAILS?: string;
  ACCESS_AUD?: string;
}

/**
 * Typed locally and defensively: `ctx.access` is only present when Access matched
 * the request, and getIdentity() may resolve to undefined.
 */
export interface AccessIdentityLike { email?: string; name?: string; [k: string]: unknown }
export interface ApiCtx {
  access?: { readonly aud?: string; getIdentity(): Promise<AccessIdentityLike | undefined> } | undefined;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const NO_STORE = { 'cache-control': 'no-store' };

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE, ...headers },
  });
}
const fail = (status: number, error: string) => json({ error }, status);

export function allowedEmails(env: ApiEnv): Set<string> {
  return new Set((env.ALLOWED_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/** The signed-in, allowed email, or null. Never throws. */
export async function identify(env: ApiEnv, ctx: ApiCtx | undefined): Promise<string | null> {
  const access = ctx?.access;
  if (!access || typeof access.getIdentity !== 'function') return null;
  if (!env.ACCESS_AUD || access.aud !== env.ACCESS_AUD) return null;
  let email: unknown;
  try { email = (await access.getIdentity())?.email; } catch { return null; }
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  return allowedEmails(env).has(e) ? e : null;
}

async function readBody(req: Request, max: number): Promise<string> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > max) throw new HttpError(413, `Body larger than ${max} bytes`);
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > max) throw new HttpError(413, `Body larger than ${max} bytes`);
  return text;
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text.replace(/^﻿/, '')); } catch { throw new HttpError(400, 'Body is not valid JSON'); }
}

/** Strip quotes / weak prefix from each If-None-Match entry. */
export function etagMatches(header: string | null, hash: string): boolean {
  if (!header) return false;
  return header.split(',').map((s) => s.trim().replace(/^W\//, '').replace(/^"|"$/g, '')).some((t) => t === hash || t === '*');
}

/* ---------------- pack ---------------- */

interface PackRow { body: string; hash: string; updated_at: string }

async function getPack(req: Request, db: D1Like): Promise<Response> {
  const meta = await db.prepare('SELECT hash, updated_at FROM packs WHERE id = 1').first<Omit<PackRow, 'body'>>();
  if (!meta) return fail(404, 'no pack');
  const headers = { etag: `"${meta.hash}"`, 'last-modified': new Date(meta.updated_at).toUTCString() };
  if (etagMatches(req.headers.get('if-none-match'), meta.hash)) {
    return new Response(null, { status: 304, headers: { ...NO_STORE, ...headers } });
  }
  const row = await db.prepare('SELECT body, hash, updated_at FROM packs WHERE id = 1').first<PackRow>();
  if (!row) return fail(404, 'no pack');
  return new Response(row.body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE, etag: `"${row.hash}"`, 'last-modified': headers['last-modified'] },
  });
}

async function packStatus(db: D1Like): Promise<Response> {
  const row = await db.prepare(
    "SELECT hash, updated_at, json_extract(body, '$.id') AS pack_id, json_extract(body, '$.counts.lemmas') AS lemmas FROM packs WHERE id = 1",
  ).first<{ hash: string; updated_at: string; pack_id: string | null; lemmas: number | null }>();
  const s: PackStatus = row
    ? { present: true, hash: row.hash, updatedAt: row.updated_at, ...(row.pack_id ? { id: row.pack_id } : {}), ...(row.lemmas != null ? { lemmas: Number(row.lemmas) } : {}) }
    : { present: false };
  return json(s);
}

async function putPack(req: Request, db: D1Like): Promise<Response> {
  const raw = parseJson(await readBody(req, MAX_PACK_BYTES));
  let pack;
  try { pack = parsePack(raw); } catch (e) { throw new HttpError(422, (e as Error).message); }
  const body = packText(pack);
  const hash = await packHash(pack);
  const updatedAt = new Date().toISOString();
  await db.prepare(
    'INSERT INTO packs (id, body, hash, updated_at) VALUES (1, ?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET body = excluded.body, hash = excluded.hash, updated_at = excluded.updated_at',
  ).bind(body, hash, updatedAt).run();
  const out: PutPackResponse = { hash, id: pack.id, lemmas: pack.counts.lemmas, updatedAt };
  return json(out, 200, { etag: `"${hash}"` });
}

/* ---------------- events ---------------- */

async function postEvents(req: Request, db: D1Like): Promise<Response> {
  const raw = parseJson(await readBody(req, MAX_EVENTS_BODY_BYTES)) as { events?: unknown } | null;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.events)) throw new HttpError(400, 'Expected {events: [...]}');
  if (raw.events.length > MAX_EVENTS_PER_POST) throw new HttpError(413, `At most ${MAX_EVENTS_PER_POST} events per request`);
  let events: VEvent[];
  try { events = raw.events.map((e, i) => parseEvent(e, i)); } catch (e) { throw new HttpError(422, (e as Error).message); }
  const now = new Date().toISOString();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO events (id, device, ts, kind, card, grade, body, received_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
  );
  const stmts = events.map((e) => insert.bind(e.id, e.device, e.ts, e.kind, e.card ?? null, e.grade ?? null, e.body === undefined ? null : JSON.stringify(e.body), now));
  stmts.push(db.prepare('SELECT COALESCE(MAX(seq), 0) AS cursor FROM events'));
  const results = await db.batch<{ cursor?: number }>(stmts);
  const accepted = results.slice(0, -1).reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
  const cursor = Number(results[results.length - 1]?.results[0]?.cursor ?? 0);
  const out: PostEventsResponse = { accepted, cursor };
  return json(out);
}

interface EventRow { seq: number; id: string; device: string; ts: number; kind: string; card: string | null; grade: string | null; body: string | null }

export function rowToEvent(r: EventRow): ServerEvent {
  const e = { seq: Number(r.seq), id: r.id, device: r.device, ts: Number(r.ts), kind: r.kind } as ServerEvent;
  if (r.card !== null) e.card = r.card;
  if (r.grade === 'good' || r.grade === 'again') e.grade = r.grade;
  if (r.body !== null) { try { e.body = JSON.parse(r.body) as VEvent['body']; } catch { /* stored by us; ignore if corrupt */ } }
  return e;
}

function intParam(v: string | null, def: number, min: number, max: number): number {
  if (v === null || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new HttpError(400, 'Bad integer parameter');
  return Math.min(max, Math.max(min, n));
}

async function getEvents(url: URL, db: D1Like): Promise<Response> {
  const after = intParam(url.searchParams.get('after'), 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = intParam(url.searchParams.get('limit'), DEFAULT_PULL_LIMIT, 1, MAX_PULL_LIMIT);
  const { results } = await db.prepare(
    'SELECT seq, id, device, ts, kind, card, grade, body FROM events WHERE seq > ?1 ORDER BY seq LIMIT ?2',
  ).bind(after, limit + 1).all<EventRow>();
  const more = results.length > limit;
  const events = results.slice(0, limit).map(rowToEvent);
  const out: GetEventsResponse = { events, cursor: events.length ? events[events.length - 1]!.seq : after, more };
  return json(out);
}

/* ---------------- router ---------------- */

/** Same-origin path to return to after an Access login round-trip. */
export function safeNext(v: string | null): string {
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/';
}

export async function handleApi(req: Request, env: ApiEnv, ctx?: ApiCtx): Promise<Response> {
  try {
    const email = await identify(env, ctx);
    if (!email) return fail(403, 'forbidden');
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const m = req.method.toUpperCase();
    const route = `${m} ${path}`;

    if (route === `GET ${API.me}`) {
      // "Sign in again" navigates to /api/me?return=/: Access has re-authenticated us by now,
      // so send the browser back into the app.
      if (url.searchParams.has('return')) {
        return new Response(null, { status: 302, headers: { location: safeNext(url.searchParams.get('return')), ...NO_STORE } });
      }
      return json({ email });
    }

    const known = [API.pack, API.packStatus, API.events] as string[];
    if (!known.includes(path)) return fail(404, 'not found');

    await ensureSchema(env.DB);
    switch (route) {
      case `GET ${API.pack}`: return await getPack(req, env.DB);
      case `PUT ${API.pack}`: return await putPack(req, env.DB);
      case `GET ${API.packStatus}`: return await packStatus(env.DB);
      case `POST ${API.events}`: return await postEvents(req, env.DB);
      case `GET ${API.events}`: return await getEvents(url, env.DB);
      default: return fail(405, 'method not allowed');
    }
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    console.error('api error', e);
    return fail(500, 'internal error');
  }
}
