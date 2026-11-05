/**
 * GET /api/audio/:key — a pre-generated pronunciation clip from D1 table `audio`
 * (written by the vocabula-content audio Actions; key = src/audio/key.ts audioKey(text) for eSpeak,
 * geminiAudioKey(text) for Gemini, externalAudioKey(url) for human recordings).
 * GET /api/audio-index — which Gemini clips exist ({prefix: 'gm-', keys: [hex…]}), so the client
 * asks for a Gemini clip only when there is one and otherwise goes straight to the eSpeak clip
 * (no failed request per clip). ETag + no-cache: a revalidation that finds nothing new is a 304.
 * Called by handleApi after the Access identity check, like every /api route.
 * Clips never change under a key (the key hashes engine + voice + speed + text), so they
 * are cached for a year; `private` keeps them out of shared caches (the API is behind Access).
 */
import type { D1Like } from './d1.ts';
import { ensureSchema } from './schema.ts';
import { GEMINI_AUDIO_PREFIX } from '../src/audio/key.ts';

export const AUDIO_ROUTE = '/api/audio/';
export const AUDIO_INDEX_ROUTE = '/api/audio-index';
/**
 * `keys`: Gemini clips to play (hex after the prefix), minus `blocked` (reported and reverted to eSpeak);
 * `versions`: regenerated clips' take numbers (the client fetches /api/audio/<key>?v=<n>).
 */
export interface AudioIndex { prefix: string; keys: string[]; blocked: string[]; versions: Record<string, number> }
export const AUDIO_CACHE_CONTROL = 'private, max-age=31536000, immutable';
/** eSpeak clips: hex; human recordings (Audītiō): dcc-<hex>; Gemini clips: gm-<hex> (src/audio/key.ts). */
const KEY = /^(?:dcc-|gm-)?[0-9a-f]{16,64}$/;

const err = (status: number, error: string): Response => new Response(JSON.stringify({ error }), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

/** D1 returns BLOBs as number[] (older runtimes) or ArrayBuffer; the Node fake as Uint8Array. */
export function blobBytes(v: unknown): Uint8Array | null {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  if (Array.isArray(v)) return Uint8Array.from(v as number[]);
  return null;
}

export const isAudioPath = (path: string): boolean => path.startsWith(AUDIO_ROUTE) || path === AUDIO_INDEX_ROUTE;

async function etagOf(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return `"${[...d.slice(0, 12)].map((x) => x.toString(16).padStart(2, '0')).join('')}"`;
}

async function handleIndex(req: Request, db: D1Like): Promise<Response> {
  if (req.method.toUpperCase() !== 'GET') return err(405, 'method not allowed');
  await ensureSchema(db);
  // A range on the primary key: only the gm- rows are read ('.' sorts right after '-').
  const lo = GEMINI_AUDIO_PREFIX, hi = GEMINI_AUDIO_PREFIX.slice(0, -1) + String.fromCharCode(GEMINI_AUDIO_PREFIX.charCodeAt(GEMINI_AUDIO_PREFIX.length - 1) + 1);
  const [clips, flags] = (await db.batch([
    db.prepare('SELECT key FROM audio WHERE key >= ?1 AND key < ?2 ORDER BY key').bind(lo, hi),
    db.prepare('SELECT key, state, version FROM audio_flags WHERE key >= ?1 AND key < ?2').bind(lo, hi),
  ])) as unknown as [{ results: { key: string }[] }, { results: { key: string; state: string; version: number }[] }];
  const hex = (k: string) => k.slice(GEMINI_AUDIO_PREFIX.length);
  const blocked = new Set(flags.results.filter((f) => f.state === 'blocked').map((f) => f.key));
  const versions: Record<string, number> = {};
  for (const f of flags.results) if (f.state === 'redone' && Number(f.version) > 0) versions[hex(f.key)] = Number(f.version);
  const body: AudioIndex = {
    prefix: GEMINI_AUDIO_PREFIX,
    keys: clips.results.filter((r) => !blocked.has(r.key)).map((r) => hex(r.key)),
    blocked: [...blocked].sort().map(hex),
    versions,
  };
  const text = JSON.stringify(body);
  const etag = await etagOf(text);
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-cache', etag };
  if ((req.headers.get('if-none-match') ?? '').split(',').some((t) => t.trim().replace(/^W\//, '') === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(text, { status: 200, headers });
}

export async function handleAudio(req: Request, db: D1Like, path: string): Promise<Response> {
  if (path === AUDIO_INDEX_ROUTE) return handleIndex(req, db);
  if (req.method.toUpperCase() !== 'GET') return err(405, 'method not allowed');
  const key = path.slice(AUDIO_ROUTE.length);
  if (!KEY.test(key)) return err(404, 'not found');
  const etag = `"${key}"`;
  // A key's bytes never change, so a revalidation needs no database read.
  if ((req.headers.get('if-none-match') ?? '').split(',').some((t) => t.trim().replace(/^W\//, '') === etag)) {
    return new Response(null, { status: 304, headers: { 'cache-control': AUDIO_CACHE_CONTROL, etag } });
  }
  await ensureSchema(db);
  const row = await db.prepare('SELECT mime, bytes FROM audio WHERE key = ?1').bind(key).first<{ mime: string; bytes: unknown }>();
  const bytes = row ? blobBytes(row.bytes) : null;
  if (!row || !bytes) return err(404, 'no audio');
  const headers = { 'content-type': row.mime, 'cache-control': AUDIO_CACHE_CONTROL, etag, 'content-length': String(bytes.byteLength) };
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}
