/** Small pure helpers: seeded RNG, answer comparison, local days, hashing. */
import { stripMacrons } from '../morph/phonology.ts';

/* ---------------- seeded RNG (mulberry32) ---------------- */

export type Rng = () => number;

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(xs: readonly T[], r: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export const pick = <T>(xs: readonly T[], r: Rng): T | undefined => xs[Math.floor(r() * xs.length)];

/* ---------------- answer comparison ---------------- */

/** NFC, trim, collapse spaces, lowercase, drop trailing ! . ? */
export function normalizeAnswer(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[!.?]+$/, '').trim().toLowerCase();
}

export interface Comparison {
  ok: boolean;
  /** Correct except for macrons (missing or extra). */
  macronMiss: boolean;
  /** The accepted spelling that matched (or the first expected answer). */
  expected: string;
}

/**
 * Compare a typed answer with one or more accepted spellings.
 * NFC, trimmed, case-insensitive; macrons optional (a macron-only difference
 * is still correct, flagged with `macronMiss` so the UI can show the spelling).
 */
export function compareAnswer(typed: string, accepted: string | readonly string[]): Comparison {
  const list = typeof accepted === 'string' ? [accepted] : accepted;
  const t = normalizeAnswer(typed);
  for (const a of list) if (normalizeAnswer(a) === t && t !== '') return { ok: true, macronMiss: false, expected: a };
  const ts = stripMacrons(t);
  for (const a of list) {
    if (stripMacrons(normalizeAnswer(a)) === ts && ts !== '') return { ok: true, macronMiss: true, expected: a };
  }
  return { ok: false, macronMiss: false, expected: list[0] ?? '' };
}

/* ---------------- dates ---------------- */

/** Local calendar day "YYYY-MM-DD" for a timestamp. */
export function localDay(ts: number | Date): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Days are compared as UTC midnights of their calendar date (no DST surprises). */
export const dayNum = (day: string): number => Math.round(Date.parse(`${day}T00:00:00Z`) / 86400000);
export const dayStr = (n: number): string => new Date(n * 86400000).toISOString().slice(0, 10);

/* ---------------- ids & hashing ---------------- */

export function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** FNV-1a 32-bit over UTF-16 code units, as 8 hex digits. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function hashSeed(s: string): number {
  return parseInt(fnv1a(s), 16);
}
