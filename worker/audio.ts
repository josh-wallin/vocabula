/**
 * GET /api/audio/:key — a pre-generated pronunciation clip from D1 table `audio`
 * (written by the vocabula-content audio Action; key = src/audio/key.ts audioKey(text)).
 * Called by handleApi after the Access identity check, like every /api route.
 * Clips never change under a key (the key hashes engine + voice + speed + text), so they
 * are cached for a year; `private` keeps them out of shared caches (the API is behind Access).
 */
import type { D1Like } from './d1.ts';
import { ensureSchema } from './schema.ts';

export const AUDIO_ROUTE = '/api/audio/';
export const AUDIO_CACHE_CONTROL = 'private, max-age=31536000, immutable';
/** eSpeak clips: hex; human recordings (Audītiō): dcc-<hex> (src/audio/key.ts externalAudioKey). */
const KEY = /^(?:dcc-)?[0-9a-f]{16,64}$/;

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

export const isAudioPath = (path: string): boolean => path.startsWith(AUDIO_ROUTE);

export async function handleAudio(req: Request, db: D1Like, path: string): Promise<Response> {
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
