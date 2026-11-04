import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiCtx } from '../worker/api.ts';
import {
  GEMINI_MODEL, GEMINI_VOICE, OPENAI_INSTRUCTIONS, OPENAI_MODEL, OPENAI_URL, OPENAI_VOICE, TTS_SCHEMA,
  geminiUrl, handleTts, isTtsPath, pcmToWav, ttsKey, type TtsEnv,
} from '../worker/tts.ts';
import { toPseudo } from '../src/compare/pseudo.ts';
import { FakeD1 } from './d1fake.ts';

const AUD = 'test-aud';
const EMAIL = 'joshua.a.wallin@gmail.com';
const BASE = 'https://vocabula.example';
const ok: ApiCtx = { access: { aud: AUD, getIdentity: async () => ({ email: EMAIL }) } };

interface Call { url: string; init: RequestInit; body: any }
let db: FakeD1;
let env: TtsEnv;
let calls: Call[];
let reply: (url: string) => Response;

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3, 4, 5]);
const PCM = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]);
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

beforeEach(() => {
  db = new FakeD1();
  calls = [];
  reply = (url) => url === OPENAI_URL
    ? new Response(MP3, { headers: { 'content-type': 'audio/mpeg' } })
    : Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: b64(PCM) } }] } }] });
  env = {
    DB: db, ALLOWED_EMAILS: EMAIL, ACCESS_AUD: AUD, OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'g-test',
    FETCH: async (url, init) => { calls.push({ url, init, body: JSON.parse(String(init.body)) }); return reply(url); },
  };
});

function call(method: string, path: string, body?: unknown, ...rest: [ctx?: ApiCtx | undefined]) {
  const ctx = rest.length ? rest[0] : ok; // an explicit undefined means "no Access context"
  const init: RequestInit = { method };
  if (body !== undefined) { init.body = typeof body === 'string' ? body : JSON.stringify(body); init.headers = { 'content-type': 'application/json' }; }
  return handleTts(new Request(BASE + path, init), env, ctx);
}
const gen = (engine: string, variant: string, text = 'Cicerō') => call('POST', '/api/tts', { engine, variant, text });

describe('tts: access and secrets', () => {
  it('routes only /api/tts and /api/tts/*', () => {
    expect(isTtsPath('/api/tts')).toBe(true);
    expect(isTtsPath('/api/tts/rating')).toBe(true);
    expect(isTtsPath('/api/ttsx')).toBe(false);
    expect(isTtsPath('/api/audio/abc')).toBe(false);
  });
  it('403 without an Access identity, before any upstream call', async () => {
    for (const ctx of [undefined, { access: { aud: AUD, getIdentity: async () => ({ email: 'mallory@example.com' }) } }]) {
      const r = await call('POST', '/api/tts', { engine: 'openai', variant: 'plain', text: 'Cicerō' }, ctx);
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ error: 'forbidden' });
    }
    expect((await call('GET', '/api/tts/ratings', undefined, undefined)).status).toBe(403);
    expect(calls).toHaveLength(0);
  });
  it('503 naming the missing key, with where to add it', async () => {
    env.OPENAI_API_KEY = undefined;
    env.GEMINI_API_KEY = '';
    const a = await gen('openai', 'pseudo');
    expect(a.status).toBe(503);
    expect(await a.json()).toEqual({ error: 'OPENAI_API_KEY not set', help: expect.stringContaining('Variables and Secrets') });
    const b = await gen('gemini', 'plain');
    expect(b.status).toBe(503);
    expect(await b.json()).toMatchObject({ error: 'GEMINI_API_KEY not set' });
    expect(calls).toHaveLength(0);
    expect(await (await call('GET', '/api/tts/status')).json()).toEqual({ openai: false, gemini: false });
  });
  it('validates the request', async () => {
    expect((await gen('espeak', 'plain')).status).toBe(400);
    expect((await gen('openai', 'loud')).status).toBe(400);
    expect((await gen('openai', 'plain', '')).status).toBe(400);
    expect((await gen('openai', 'plain', 'a'.repeat(401))).status).toBe(400);
    expect((await call('POST', '/api/tts', 'not json')).status).toBe(400);
    expect((await call('GET', '/api/tts')).status).toBe(405);
    expect((await call('GET', '/api/tts/nope')).status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});

describe('tts: OpenAI', () => {
  it('sends the documented request body; respelled variant sends toPseudo(text)', async () => {
    const r = await gen('openai', 'pseudo', 'Arma virumque canō');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('audio/mpeg');
    expect(r.headers.get('x-tts-cache')).toBe('miss');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(MP3);
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.url).toBe('https://api.openai.com/v1/audio/speech');
    expect(c.init.method).toBe('POST');
    expect((c.init.headers as Record<string, string>)['authorization']).toBe('Bearer sk-test');
    expect(c.body).toEqual({
      model: OPENAI_MODEL, voice: OPENAI_VOICE, input: 'ÀRma wiRÙMkwe KÀnoo',
      instructions: OPENAI_INSTRUCTIONS.pseudo, response_format: 'mp3',
    });
    expect(OPENAI_MODEL).toBe('gpt-4o-mini-tts');
  });
  it('plain variant sends the macronized Latin unchanged', async () => {
    await gen('openai', 'plain', 'Arma virumque canō');
    expect(calls[0]!.body).toMatchObject({ input: 'Arma virumque canō', instructions: OPENAI_INSTRUCTIONS.plain });
    expect(calls[0]!.body.instructions).toMatch(/classical/);
  });
  it('a cache hit avoids a second upstream call; variants and engines are cached separately', async () => {
    const a = await gen('openai', 'pseudo');
    const key = a.headers.get('x-tts-key')!;
    expect(key).toBe(await ttsKey('openai', 'pseudo', 'Cicerō'));
    const b = await gen('openai', 'pseudo', '  Cicerō ');
    expect(b.headers.get('x-tts-cache')).toBe('hit');
    expect(new Uint8Array(await b.arrayBuffer())).toEqual(MP3);
    expect(calls).toHaveLength(1);
    // Served from cache even after the key is removed.
    env.OPENAI_API_KEY = undefined;
    expect((await gen('openai', 'pseudo')).status).toBe(200);
    env.OPENAI_API_KEY = 'sk-test';
    await gen('openai', 'plain');
    expect(calls).toHaveLength(2);
    // GET /api/tts/audio/:key serves it and never generates.
    const g = await call('GET', `/api/tts/audio/${key}`);
    expect(g.status).toBe(200);
    expect(new Uint8Array(await g.arrayBuffer())).toEqual(MP3);
    expect((await call('GET', `/api/tts/audio/${'0'.repeat(32)}`)).status).toBe(404);
    expect((await call('GET', '/api/tts/audio/nothex')).status).toBe(400);
    expect(calls).toHaveLength(2);
    const list = (await (await call('GET', '/api/tts/cache')).json()) as { clips: { key: string; engine: string; variant: string; text: string }[] };
    expect(list.clips.map((c) => [c.engine, c.variant, c.text])).toEqual([['openai', 'pseudo', 'Cicerō'], ['openai', 'plain', 'Cicerō']]);
  });
  it('upstream errors are a 502 with the message, and nothing is cached', async () => {
    reply = () => Response.json({ error: { message: 'Incorrect API key provided' } }, { status: 401 });
    const r = await gen('openai', 'plain');
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: 'OpenAI 401: Incorrect API key provided' });
    expect((await (await call('GET', '/api/tts/cache')).json() as { clips: unknown[] }).clips).toHaveLength(0);
  });
});

describe('tts: Gemini', () => {
  it('sends the documented generateContent body and wraps PCM as WAV', async () => {
    const r = await gen('gemini', 'plain', 'Caelum pulchrum est.');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('audio/wav');
    const c = calls[0]!;
    expect(c.url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
    expect(c.url).toBe(geminiUrl());
    expect((c.init.headers as Record<string, string>)['x-goog-api-key']).toBe('g-test');
    expect(c.body).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'Caelum pulchrum est.', speech_metadata: { style: expect.stringMatching(/classical/) } }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice: GEMINI_VOICE } } },
    });
    const wav = new Uint8Array(await r.arrayBuffer());
    expect(wav).toEqual(pcmToWav(PCM, 24000));
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(24000);
    // cached
    expect((await gen('gemini', 'plain', 'Caelum pulchrum est.')).headers.get('x-tts-cache')).toBe('hit');
    expect(calls).toHaveLength(1);
  });
  it('passes a WAV response through unchanged; pseudo variant respells', async () => {
    const wav = pcmToWav(PCM, 16000);
    reply = () => Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: b64(wav) } }] } }] });
    const r = await gen('gemini', 'pseudo', 'centum');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(wav);
    expect(calls[0]!.body.contents[0].parts[0].text).toBe(toPseudo('centum'));
  });
  it('502 when no audio comes back', async () => {
    reply = () => Response.json({ candidates: [] });
    expect((await gen('gemini', 'plain')).status).toBe(502);
  });
});

describe('tts: ratings', () => {
  it('stores, upserts and lists ratings', async () => {
    const r1 = { item: 'c-hard', engine: 'openai', variant: 'pseudo', score: 4, problems: ['length'], note: 'ō short' };
    expect((await call('POST', '/api/tts/rating', r1)).status).toBe(200);
    expect((await call('POST', '/api/tts/rating', { ...r1, engine: 'espeak', variant: 'default', score: 2, problems: ['c', 'c'] })).status).toBe(200);
    expect((await call('POST', '/api/tts/rating', { ...r1, score: 5, problems: [], note: '' })).status).toBe(200);
    const { ratings } = (await (await call('GET', '/api/tts/ratings')).json()) as { ratings: Record<string, unknown>[] };
    expect(ratings).toHaveLength(2);
    expect(ratings.find((r) => r['engine'] === 'openai')).toMatchObject({ item: 'c-hard', variant: 'pseudo', score: 5, problems: [], note: '' });
    expect(ratings.find((r) => r['engine'] === 'espeak')).toMatchObject({ score: 2, problems: ['c'], note: 'ō short', updated_at: expect.any(String) });
  });
  it('score may be null; bad ratings are 422', async () => {
    expect((await call('POST', '/api/tts/rating', { item: 's1', engine: 'gemini', variant: 'plain', score: null, problems: ['stress'], note: '' })).status).toBe(200);
    for (const bad of [
      { item: 's1', engine: 'gemini', variant: 'plain', score: 6, problems: [] },
      { item: 's1', engine: 'gemini', variant: 'plain', score: 2.5, problems: [] },
      { item: 's1', engine: 'polly', variant: 'plain', score: 3, problems: [] },
      { item: 's1', engine: 'gemini', variant: 'plain', score: 3, problems: ['vibes'] },
      { item: 'bad item!', engine: 'gemini', variant: 'plain', score: 3, problems: [] },
      { item: 's1', engine: 'gemini', variant: 'plain', score: 3, problems: [], note: 'x'.repeat(2001) },
    ]) expect((await call('POST', '/api/tts/rating', bad)).status).toBe(422);
  });
});

describe('tts schema', () => {
  it('migrations/0003_tts_cache.sql matches TTS_SCHEMA', () => {
    const sql = readFileSync(resolve(import.meta.dirname, '../migrations/0003_tts_cache.sql'), 'utf8');
    const stmts = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
    expect(stmts).toEqual(TTS_SCHEMA.map((s) => s.trim()));
  });
});
