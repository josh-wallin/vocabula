/**
 * Iter Latinum sync code: a short, copyable string summarizing one day's practice.
 *
 *   VOC1-<base64url(JSON)>-<checksum>
 *
 * JSON is compact: {"d":"2026-11-03","l":2,"n":12,"r":40}
 *   d = local date, l = lessons finished that day, n = new words introduced, r = graded reviews.
 * checksum = first 6 hex digits of FNV-1a 32 over "VOC1-" + payload.
 */
import { fnv1a } from './util.ts';

export interface DaySummary { date: string; lessons: number; newWords: number; reviews: number }

const PREFIX = 'VOC1-';

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const check = (payload: string): string => fnv1a(PREFIX + payload).slice(0, 6);

export function encodeSyncCode(s: DaySummary): string {
  const payload = b64urlEncode(JSON.stringify({ d: s.date, l: s.lessons, n: s.newWords, r: s.reviews }));
  return `${PREFIX}${payload}-${check(payload)}`;
}

export function decodeSyncCode(code: string): DaySummary {
  const c = code.trim();
  if (!c.startsWith(PREFIX)) throw new Error('Not a Vocābula code (expected VOC1-…)');
  const body = c.slice(PREFIX.length);
  const dash = body.lastIndexOf('-');
  if (dash < 0) throw new Error('Missing checksum');
  const payload = body.slice(0, dash);
  if (body.slice(dash + 1) !== check(payload)) throw new Error('Checksum mismatch');
  const o = JSON.parse(b64urlDecode(payload)) as { d?: unknown; l?: unknown; n?: unknown; r?: unknown };
  if (typeof o.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.d) ||
      typeof o.l !== 'number' || typeof o.n !== 'number' || typeof o.r !== 'number') throw new Error('Malformed code');
  return { date: o.d, lessons: o.l, newWords: o.n, reviews: o.r };
}
