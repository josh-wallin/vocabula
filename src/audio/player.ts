/**
 * Browser audio: fetch clips from /api/audio/:key (the service worker caches them, CacheFirst,
 * cache "audio"), play them through one shared <audio> element as blob URLs (no Range-request
 * trouble on iOS Safari), and track which clips are known to be missing or cached so lessons
 * only build listening exercises that can play. Never throws to callers.
 *
 * Gemini clips (PREFER_GEMINI): a clip is an AudioRef with an eSpeak `key` and a `gemini` key.
 * The Gemini clip is played when it is on this device, or when we're online and the server's
 * index (GET /api/audio-index, fetched once per start and kept in localStorage for offline use)
 * lists it; otherwise the eSpeak clip, exactly as before. So a text without a Gemini clip costs
 * no failed request, and offline nothing changes: whichever clip is on the device plays. If the
 * index is stale (a listed Gemini clip 404s), the eSpeak clip is tried right after.
 */
import { audioUrl, GEMINI_AUDIO_PREFIX } from './key.ts';
import type { AudioRef } from './items.ts';

/** The one switch: false = eSpeak only (no index request, Gemini keys ignored). */
export const PREFER_GEMINI = true;

/** A clip: an AudioRef (eSpeak key + optional Gemini key) or a bare key (Audītiō recordings). */
export type Clip = string | Pick<AudioRef, 'key' | 'gemini'>;

export const AUDIO_INDEX_URL = '/api/audio-index';
const INDEX_STORE = 'vocabula.audioIndex.gm';
/** Gemini keys (with prefix) the server has, or null before the index is known. */
let geminiOnServer: Set<string> | null = null;

const AUDIO_CACHE = 'audio';
const MAX_BLOBS = 150;

/** Clips the server said it doesn't have (404) this session. */
const missing = new Set<string>();
/** Clips in the service-worker cache (or fetched this session). */
const cached = new Set<string>();
/** key → object URL, most recent last. */
const blobs = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

let el: HTMLAudioElement | null = null;
const audioEl = (): HTMLAudioElement | null => {
  if (typeof Audio === 'undefined') return null;
  el ??= new Audio();
  return el;
};

const online = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

/** Read which clips the service worker has cached, and the Gemini index (call once at start; harmless to repeat). */
export async function initAudioCache(): Promise<void> {
  const index = initAudioIndex();
  try {
    if (typeof caches === 'undefined') return;
    const c = await caches.open(AUDIO_CACHE);
    for (const req of await c.keys()) {
      const m = /\/api\/audio\/((?:dcc-|gm-)?[0-9a-f]+)$/.exec(new URL(req.url).pathname);
      if (m) cached.add(m[1]!);
    }
  } catch { /* no Cache Storage: fine */ } finally { await index; }
}

function setIndex(v: unknown): boolean {
  const j = v as { prefix?: unknown; keys?: unknown } | null;
  if (!j || j.prefix !== GEMINI_AUDIO_PREFIX || !Array.isArray(j.keys)) return false;
  geminiOnServer = new Set((j.keys as unknown[]).filter((k): k is string => typeof k === 'string').map((k) => GEMINI_AUDIO_PREFIX + k));
  return true;
}

/** Which Gemini clips the server has: the last copy at once (offline too), then a fresh one when online. */
export async function initAudioIndex(): Promise<void> {
  if (!PREFER_GEMINI) return;
  try { const raw = localStorage.getItem(INDEX_STORE); if (raw && !geminiOnServer) setIndex(JSON.parse(raw)); } catch { /* no storage */ }
  if (!online()) return;
  try {
    const r = await fetch(AUDIO_INDEX_URL, { credentials: 'same-origin', redirect: 'manual' });
    if (r.status !== 200 || !(r.headers.get('content-type') ?? '').includes('json')) return; // signed out, old server: keep what we have
    const j: unknown = await r.json();
    if (setIndex(j)) { try { localStorage.setItem(INDEX_STORE, JSON.stringify(j)); } catch { /* full or blocked */ } }
  } catch { /* offline: keep what we have */ }
}

const isGemini = (k: string): boolean => k.startsWith(GEMINI_AUDIO_PREFIX);
const candidates = (c: Clip): string[] => (typeof c === 'string' ? [c] : PREFER_GEMINI && c.gemini ? [c.gemini, c.key] : [c.key]);
const onDevice = (k: string): boolean => blobs.has(k) || cached.has(k);
/** eSpeak and recordings: assume the server has it (404 → missing). Gemini: only if the index says so. */
const maybeOnServer = (k: string): boolean => !isGemini(k) || (geminiOnServer?.has(k) ?? false);
const usable = (k: string): boolean => !missing.has(k) && (onDevice(k) || (online() && maybeOnServer(k)));

/** The key that would play now: Gemini when usable, else the eSpeak clip. */
export function clipKey(c: Clip): string {
  const ks = candidates(c);
  return ks.find(usable) ?? ks[ks.length - 1]!;
}

/** Likely playable now: some candidate not known missing, and online or already on this device. */
export function audioAvailable(c: Clip): boolean {
  return candidates(c).some(usable);
}
/** The server said it has no clip (eSpeak 404), and no Gemini clip is to be had either. */
export const audioMissing = (c: Clip): boolean => candidates(c).every((k) => missing.has(k) || (isGemini(k) && !usable(k)));

class ClipError extends Error { constructor(readonly missing: boolean) { super(missing ? 'no clip' : 'clip unavailable'); } }

async function fetchClip(key: string): Promise<Blob> {
  let r: Response;
  try { r = await fetch(audioUrl(key), { credentials: 'same-origin', redirect: 'manual' }); } catch { throw new ClipError(false); }
  const type = r.headers.get('content-type') ?? '';
  if (r.status === 404) { missing.add(key); throw new ClipError(true); }
  if (!r.ok || !type.startsWith('audio/')) throw new ClipError(false); // offline, expired sign-in (redirect), error
  cached.add(key);
  return r.blob();
}

/**
 * An object URL for a clip (fetched once per session). Rejects if it can't be had.
 * Tries clipKey(c) first; if that fails, the eSpeak clip (never a Gemini clip the index doesn't list).
 */
export async function loadClip(c: Clip): Promise<string> {
  const ks = candidates(c);
  const first = clipKey(c);
  const last = ks[ks.length - 1]!;
  let error: unknown = new ClipError(true);
  for (const k of [first, ...ks.filter((x) => x !== first)]) {
    if (k !== first && k !== last && !usable(k)) continue;
    try { return await loadKey(k); } catch (e) { error = e; }
  }
  throw error;
}

function loadKey(key: string): Promise<string> {
  const have = blobs.get(key);
  if (have) { blobs.delete(key); blobs.set(key, have); return Promise.resolve(have); }
  if (missing.has(key)) return Promise.reject(new ClipError(true));
  let p = inflight.get(key);
  if (!p) {
    p = fetchClip(key).then((b) => {
      const url = URL.createObjectURL(b);
      blobs.set(key, url);
      while (blobs.size > MAX_BLOBS) {
        const [k, u] = blobs.entries().next().value as [string, string];
        blobs.delete(k); URL.revokeObjectURL(u);
      }
      return url;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/** Play a clip. Resolves true once playback starts, false if it couldn't (missing, offline, autoplay blocked). */
export async function playClip(c: Clip): Promise<boolean> {
  const a = audioEl();
  if (!a) return false;
  try {
    const url = await loadClip(c);
    a.pause();
    a.src = url;
    a.currentTime = 0;
    await a.play();
    return true;
  } catch { return false; }
}

export function stopAudio(): void { try { audioEl()?.pause(); } catch { /* ignore */ } }

/** Warm the cache for clips a lesson will use (a few at a time, in order). Resolves when done. */
export async function prefetchClips(clips: readonly Clip[], concurrency = 4): Promise<void> {
  if (!online()) return;
  const byKey = new Map<string, Clip>();
  for (const c of clips) { const k = clipKey(c); if (!byKey.has(k)) byKey.set(k, c); }
  const todo = [...byKey].filter(([k]) => !blobs.has(k) && !missing.has(k)).map(([, c]) => c);
  let i = 0;
  const work = async () => { while (i < todo.length) { const c = todo[i++]!; await loadClip(c).catch(() => undefined); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, work));
}

/**
 * iOS only lets audio play from a user gesture; playing (silently) once inside the first tap
 * unlocks the shared element for later programmatic plays (autoplay of the next clip).
 */
let unlocked = false;
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
export function unlockAudio(): void {
  if (unlocked) return;
  const a = audioEl();
  if (!a) return;
  unlocked = true;
  try {
    if (!a.src) { a.src = SILENT; void a.play().then(() => a.pause(), () => { unlocked = false; }); }
  } catch { unlocked = false; }
}
