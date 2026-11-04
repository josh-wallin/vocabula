/**
 * The browser player's clip choice (src/audio/player.ts): Gemini when the server's index lists
 * it or it's on the device, else eSpeak; no request for a Gemini clip the index doesn't list;
 * a stale index falls back to eSpeak; offline plays whatever is on the device.
 * Node has no Audio / Cache Storage / localStorage: the player degrades to fetch + Sets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioKey, geminiAudioKey } from '../src/audio/key.ts';

type Player = typeof import('../src/audio/player.ts');
let P: Player;
let requests: string[];
let have: Set<string>;
let index: string[] | null;
let offline: boolean;

const ref = (text: string) => ({ key: audioKey(text), text, gemini: geminiAudioKey(text) });
const MP3 = () => new Response(new Uint8Array([0x49, 0x44, 0x33]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });

beforeEach(async () => {
  vi.resetModules();
  requests = [];
  have = new Set();
  index = null;
  offline = false;
  vi.stubGlobal('navigator', { get onLine() { return !offline; } });
  vi.stubGlobal('fetch', async (u: string) => {
    if (offline) throw new TypeError('Failed to fetch');
    requests.push(u);
    if (u === '/api/audio-index') {
      return index ? Response.json({ prefix: 'gm-', keys: index.map((k) => k.slice(3)) }) : Response.json({ error: 'not found' }, { status: 404 });
    }
    const key = u.replace('/api/audio/', '');
    return have.has(key) ? MP3() : Response.json({ error: 'no audio' }, { status: 404 });
  });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:${Math.random()}`, revokeObjectURL: () => undefined }));
  P = await import('../src/audio/player.ts');
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('player: Gemini preferred, eSpeak fallback', () => {
  it('is on (the one switch)', () => expect(P.PREFER_GEMINI).toBe(true));

  it('no index (old server, or before the bulk run): eSpeak only, no Gemini request at all', async () => {
    const a = ref('amō');
    have.add(a.key);
    await P.initAudioCache();
    expect(P.clipKey(a)).toBe(a.key);
    expect(P.audioAvailable(a)).toBe(true);
    await P.loadClip(a);
    await P.prefetchClips([ref('rosa'), a]);
    expect(requests.filter((r) => r.includes('gm-'))).toEqual([]);
  });

  it('empty index: same, one index request per start', async () => {
    index = [];
    const a = ref('amō');
    have.add(a.key);
    await P.initAudioCache();
    await P.loadClip(a);
    expect(requests).toEqual(['/api/audio-index', `/api/audio/${a.key}`]);
  });

  it('listed in the index: the Gemini clip, and only that', async () => {
    const a = ref('amō'), b = ref('rosa');
    index = [a.gemini];
    have.add(a.gemini).add(a.key).add(b.key);
    await P.initAudioCache();
    expect(P.clipKey(a)).toBe(a.gemini);
    expect(P.clipKey(b)).toBe(b.key);
    await P.prefetchClips([a, b]);
    expect(requests.slice(1).sort()).toEqual([`/api/audio/${a.gemini}`, `/api/audio/${b.key}`].sort());
  });

  it('stale index (listed but 404): falls back to eSpeak in the same call, then sticks with it', async () => {
    const a = ref('amō');
    index = [a.gemini];
    have.add(a.key);
    await P.initAudioCache();
    await expect(P.loadClip(a)).resolves.toMatch(/^blob:/);
    expect(requests.slice(1)).toEqual([`/api/audio/${a.gemini}`, `/api/audio/${a.key}`]);
    expect(P.clipKey(a)).toBe(a.key);
    expect(P.audioMissing(a)).toBe(false);
  });

  it('neither clip: missing after the eSpeak 404, and the Gemini key is never asked for unlisted', async () => {
    index = [];
    const a = ref('nesciō');
    await P.initAudioCache();
    await expect(P.loadClip(a)).rejects.toThrow();
    expect(P.audioMissing(a)).toBe(true);
    expect(P.audioAvailable(a)).toBe(false);
    expect(requests.filter((r) => r.includes('gm-'))).toEqual([]);
  });

  it('offline: a clip fetched earlier this session still plays; nothing else is offered', async () => {
    const a = ref('amō'), b = ref('rosa');
    index = [a.gemini];
    have.add(a.gemini).add(b.key);
    await P.initAudioCache();
    await P.loadClip(a);
    offline = true;
    expect(P.clipKey(a)).toBe(a.gemini);
    expect(P.audioAvailable(a)).toBe(true);
    await expect(P.loadClip(a)).resolves.toMatch(/^blob:/);
    expect(P.audioAvailable(b)).toBe(false); // never fetched: hidden, as before
  });

  it('bare keys (Audītiō recordings) are unchanged', async () => {
    const k = 'dcc-' + '1'.repeat(24);
    have.add(k);
    expect(P.clipKey(k)).toBe(k);
    await expect(P.loadClip(k)).resolves.toMatch(/^blob:/);
    expect(requests).toEqual([`/api/audio/${k}`]);
  });

  it('refs without a Gemini key play their eSpeak key', async () => {
    index = [];
    await P.initAudioCache();
    const a = { key: audioKey('amō'), text: 'amō' };
    expect(P.clipKey(a)).toBe(a.key);
  });
});
