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
 * The index also lists Gemini clips the owner reported and reverted (`blocked`: eSpeak plays, even
 * if the Gemini take is cached here) and regenerated ones (`versions`: fetched under ?v=<n>).
 */
import { audioUrl, GEMINI_AUDIO_PREFIX } from './key.ts';
import type { AudioRef } from './items.ts';

/** The one switch: false = eSpeak only (no index request, Gemini keys ignored). */
export const PREFER_GEMINI = true;

/** A clip: an AudioRef (eSpeak key + optional Gemini key) or a bare key (Audītiō recordings). */
export type Clip = string | (Pick<AudioRef, 'key' | 'gemini'> & { text?: string });

export const AUDIO_INDEX_URL = '/api/audio-index';
const INDEX_STORE = 'vocabula.audioIndex.gm';
/** Gemini keys (with prefix) the server has, or null before the index is known. */
let geminiOnServer: Set<string> | null = null;
/** Gemini clips the owner reported and reverted to eSpeak: never played, even from the device cache. */
let geminiBlocked = new Set<string>();
/** Gemini clips regenerated after a report: fetched as /api/audio/<key>?v=<n>, so no cached old take is reused. */
let geminiVersions = new Map<string, number>();

const AUDIO_CACHE = 'audio';
const MAX_BLOBS = 150;

/*
 * The sets and maps below are keyed by clip id: the key, plus `?v=<n>` for a regenerated Gemini clip
 * (idOf). The id is also the URL path tail, so the service worker caches each take separately.
 */
/** Clips the server said it doesn't have (404) this session. */
const missing = new Set<string>();
/** Clips in the service-worker cache (or fetched this session). */
const cached = new Set<string>();
/** id → object URL, most recent last. */
const blobs = new Map<string, string>();
/** object URL → the key it plays (for reports). */
const blobKey = new Map<string, string>();
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
      const u = new URL(req.url);
      const m = /\/api\/audio\/((?:dcc-|gm-)?[0-9a-f]+)$/.exec(u.pathname);
      if (m) cached.add(m[1]! + (/^\?v=\d+$/.test(u.search) ? u.search : ''));
    }
  } catch { /* no Cache Storage: fine */ } finally { await index; }
}

function setIndex(v: unknown): boolean {
  const j = v as { prefix?: unknown; keys?: unknown; blocked?: unknown; versions?: unknown } | null;
  if (!j || j.prefix !== GEMINI_AUDIO_PREFIX || !Array.isArray(j.keys)) return false;
  const hexes = (xs: unknown): string[] => (Array.isArray(xs) ? xs.filter((k): k is string => typeof k === 'string').map((k) => GEMINI_AUDIO_PREFIX + k) : []);
  geminiOnServer = new Set(hexes(j.keys));
  geminiBlocked = new Set(hexes(j.blocked));
  const vs = j.versions && typeof j.versions === 'object' && !Array.isArray(j.versions) ? Object.entries(j.versions as Record<string, unknown>) : [];
  geminiVersions = new Map(vs.filter(([, n]) => Number.isInteger(n) && (n as number) > 0).map(([k, n]) => [GEMINI_AUDIO_PREFIX + k, n as number]));
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
const idOf = (k: string): string => { const v = isGemini(k) ? geminiVersions.get(k) : undefined; return v ? `${k}?v=${v}` : k; };
const onDevice = (k: string): boolean => blobs.has(idOf(k)) || cached.has(idOf(k));
/** eSpeak and recordings: assume the server has it (404 → missing). Gemini: only if the index says so. */
const maybeOnServer = (k: string): boolean => !isGemini(k) || (geminiOnServer?.has(k) ?? false);
const usable = (k: string): boolean =>
  !(isGemini(k) && geminiBlocked.has(k)) && !missing.has(idOf(k)) && (onDevice(k) || (online() && maybeOnServer(k)));

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
export const audioMissing = (c: Clip): boolean => candidates(c).every((k) => missing.has(idOf(k)) || (isGemini(k) && !usable(k)));

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
  const id = idOf(key);
  const have = blobs.get(id);
  if (have) { blobs.delete(id); blobs.set(id, have); return Promise.resolve(have); }
  if (missing.has(id)) return Promise.reject(new ClipError(true));
  let p = inflight.get(id);
  if (!p) {
    p = fetchClip(id).then((b) => {
      const url = URL.createObjectURL(b);
      blobs.set(id, url);
      blobKey.set(url, key);
      while (blobs.size > MAX_BLOBS) {
        const [k, u] = blobs.entries().next().value as [string, string];
        blobs.delete(k); blobKey.delete(u); URL.revokeObjectURL(u);
      }
      return url;
    }).finally(() => inflight.delete(id));
    inflight.set(id, p);
  }
  return p;
}

/** The clip that last started playing (for "bad audio" reports): its ref, the key that played, when. */
let lastPlay: { clip: Clip; key: string; at: number } | null = null;
export const lastPlayed = (): { clip: Clip; key: string; at: number } | null => lastPlay;

/** Play a clip. Resolves true once playback starts, false if it couldn't (missing, offline, autoplay blocked). */
export async function playClip(c: Clip): Promise<boolean> {
  const a = audioEl();
  if (!a) return false;
  try {
    const key = clipKey(c);
    const url = await loadClip(c);
    lastPlay = { clip: c, key: blobKey.get(url) ?? key, at: Date.now() };
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
  const todo = [...byKey].filter(([k]) => !blobs.has(idOf(k)) && !missing.has(idOf(k))).map(([, c]) => c);
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
