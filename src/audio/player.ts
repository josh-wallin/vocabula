/**
 * Browser audio: fetch clips from /api/audio/:key (the service worker caches them, CacheFirst,
 * cache "audio"), play them through one shared <audio> element as blob URLs (no Range-request
 * trouble on iOS Safari), and track which clips are known to be missing or cached so lessons
 * only build listening exercises that can play. Never throws to callers.
 */
import { audioUrl } from './key.ts';

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

/** Read which clips the service worker has cached (call once at start; harmless to repeat). */
export async function initAudioCache(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const c = await caches.open(AUDIO_CACHE);
    for (const req of await c.keys()) {
      const m = /\/api\/audio\/((?:dcc-)?[0-9a-f]+)$/.exec(new URL(req.url).pathname);
      if (m) cached.add(m[1]!);
    }
  } catch { /* no Cache Storage: fine */ }
}

/** Likely playable now: not known missing, and online or already on this device. */
export function audioAvailable(key: string): boolean {
  return !missing.has(key) && (blobs.has(key) || cached.has(key) || online());
}
export const audioMissing = (key: string): boolean => missing.has(key);

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

/** An object URL for a clip (fetched once per session). Rejects if it can't be had. */
export function loadClip(key: string): Promise<string> {
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
export async function playClip(key: string): Promise<boolean> {
  const a = audioEl();
  if (!a) return false;
  try {
    const url = await loadClip(key);
    a.pause();
    a.src = url;
    a.currentTime = 0;
    await a.play();
    return true;
  } catch { return false; }
}

export function stopAudio(): void { try { audioEl()?.pause(); } catch { /* ignore */ } }

/** Warm the cache for clips a lesson will use (a few at a time, in order). Resolves when done. */
export async function prefetchClips(keys: readonly string[], concurrency = 4): Promise<void> {
  if (!online()) return;
  const todo = [...new Set(keys)].filter((k) => !blobs.has(k) && !missing.has(k));
  let i = 0;
  const work = async () => { while (i < todo.length) { const k = todo[i++]!; await loadClip(k).catch(() => undefined); } };
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
