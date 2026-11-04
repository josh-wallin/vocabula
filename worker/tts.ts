/**
 * /api/tts/* — the voice test (#/compare): Latin text-to-speech from OpenAI and Gemini,
 * generated on request and cached in D1 (one-off cost per engine × variant × text), plus
 * the owner's ratings. Same Access check as the rest of /api (identifyDetailed).
 * Routes: see src/compare/protocol.ts.
 *
 * Secrets (Cloudflare → Workers → vocabula → Settings → Variables and Secrets):
 * OPENAI_API_KEY, GEMINI_API_KEY. A missing key is a 503 naming it; cached clips are
 * still served.
 *
 * Upstream request shapes (checked 2026-11-04):
 *  - OpenAI  POST https://api.openai.com/v1/audio/speech
 *    {model, voice, input, instructions, response_format: 'mp3'}
 *    https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
 *  - Gemini  POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *    {contents: [{role: 'user', parts: [{text, speech_metadata: {style}}]}],
 *     generationConfig: {responseModalities: ['AUDIO'], speechConfig: {voiceConfig: {voice}}}}
 *    → candidates[0].content.parts[0].inlineData.data (base64; WAV, or raw 16-bit PCM which we wrap)
 *    https://ai.google.dev/gemini-api/docs/generate-content/speech-generation
 */
import { identifyDetailed, json, type ApiCtx, type ApiEnv } from './api.ts';
import type { D1Like } from './d1.ts';
import { toPseudo } from '../src/compare/pseudo.ts';
import {
  MAX_TTS_TEXT, PROBLEMS, RATED_ENGINES, RATED_VARIANTS, SECRET_HELP, TTS_API,
  type Problem, type TtsClipInfo, type TtsEngine, type TtsRating, type TtsRatingRow, type TtsStatus, type TtsVariant,
} from '../src/compare/protocol.ts';

export interface TtsSecrets { OPENAI_API_KEY?: string; GEMINI_API_KEY?: string }
export interface TtsEnv extends ApiEnv, TtsSecrets {
  /** Test hook: replaces global fetch for upstream calls. */
  FETCH?: (input: string, init: RequestInit) => Promise<Response>;
}

/* ---------------- engine settings ---------------- */

export const OPENAI_URL = 'https://api.openai.com/v1/audio/speech';
export const OPENAI_MODEL = 'gpt-4o-mini-tts';
export const OPENAI_VOICE = 'cedar';
export const GEMINI_MODEL = 'gemini-3.8-flash-tts';
export const GEMINI_VOICE = 'Charon';
export const geminiUrl = (model = GEMINI_MODEL) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
/** Bump when the instructions or pre-processing change, so clips regenerate. */
export const PROMPT_VERSION = 'p1';

const CLASSICAL_RULES =
  'Use the restored classical pronunciation of the late Republic (W. Sidney Allen, Vox Latina), not Church or English Latin: ' +
  'c and g always hard (k, g), even before e and i; v is English w; consonantal i is English y; qu is kw; ' +
  'ae as in "eye", oe as in "oil", au as in "cow"; ph, th, ch are aspirated p, t, k, not f or th; h is a light breath; ' +
  'r is tapped; s is always voiceless. Vowels are pure, as in Italian, with no English reduction. ' +
  'Long vowels (written with a macron) last about twice as long as short ones, with the same quality. ' +
  'Double consonants are held. Stress the second-to-last syllable when it is long, otherwise the third-to-last.';

export const OPENAI_INSTRUCTIONS: Record<TtsVariant, string> = {
  plain:
    'You are a Latin teacher reading classical Latin aloud. ' + CLASSICAL_RULES +
    ' Speak slowly and clearly, articulating each syllable.',
  pseudo:
    'You are a Latin teacher reading classical Latin aloud. The text is Latin respelled for pronunciation: ' +
    'k is always k; kw is kw; w is English w; y is English y; gh is a hard g; ü is a French u. ' +
    'A doubled vowel (aa, ee, ii, oo, uu) is one long vowel with the same Italian quality as the single letter: ' +
    'ee is a long Italian e, never English "ee"; oo is a long Italian o, never English "oo". ' +
    'The syllable in CAPITALS with a grave accent carries the word stress. ' +
    'Pronounce it slowly, articulating each syllable and stressing the marked ones. Pure Italian vowels, rolled r, voiceless s.',
};

export const GEMINI_STYLE: Record<TtsVariant, string> = {
  plain:
    'Read this as Latin (language: la), slowly and clearly, like a Latin teacher modelling pronunciation. ' + CLASSICAL_RULES,
  pseudo:
    'Read this as Latin respelled for pronunciation (language: la), slowly and clearly, like a Latin teacher. ' +
    'Doubled vowels are long with Italian quality; the CAPITAL syllable with a grave accent is stressed; w and y as in English.',
};

/** The text actually sent to the engine. */
export const engineInput = (variant: TtsVariant, text: string): string => (variant === 'pseudo' ? toPseudo(text) : text);

export function openaiBody(variant: TtsVariant, text: string) {
  return {
    model: OPENAI_MODEL, voice: OPENAI_VOICE, input: engineInput(variant, text),
    instructions: OPENAI_INSTRUCTIONS[variant], response_format: 'mp3',
  };
}

export function geminiBody(variant: TtsVariant, text: string) {
  return {
    contents: [{ role: 'user', parts: [{ text: engineInput(variant, text), speech_metadata: { style: GEMINI_STYLE[variant] } }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice: GEMINI_VOICE } } },
  };
}

/* ---------------- schema ---------------- */

/** Kept separate from worker/schema.ts; migrations/0003_tts_cache.sql holds the same SQL. */
export const TTS_SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS tts_cache (
  key TEXT PRIMARY KEY,
  engine TEXT NOT NULL,
  variant TEXT NOT NULL,
  text TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS tts_ratings (
  item TEXT NOT NULL,
  engine TEXT NOT NULL,
  variant TEXT NOT NULL,
  score INTEGER,
  problems TEXT NOT NULL,
  note TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (item, engine, variant)
)`,
];

const ready = new WeakMap<D1Like, Promise<void>>();
export function ensureTtsSchema(db: D1Like): Promise<void> {
  let p = ready.get(db);
  if (!p) {
    p = db.batch(TTS_SCHEMA.map((q) => db.prepare(q))).then(() => undefined);
    p.catch(() => ready.delete(db));
    ready.set(db, p);
  }
  return p;
}

/* ---------------- helpers ---------------- */

class TtsError extends Error {
  constructor(readonly status: number, message: string, readonly extra: Record<string, unknown> = {}) { super(message); }
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function ttsKey(engine: TtsEngine, variant: TtsVariant, text: string): Promise<string> {
  const model = engine === 'openai' ? `${OPENAI_MODEL}|${OPENAI_VOICE}` : `${GEMINI_MODEL}|${GEMINI_VOICE}`;
  const s = `${engine}|${variant}|${model}|${PROMPT_VERSION}|${text.normalize('NFC').trim()}`;
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))).slice(0, 32);
}

type Bytes = Uint8Array<ArrayBuffer>;

function toBytes(v: unknown): Bytes {
  if (v instanceof Uint8Array) return new Uint8Array(v);
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v)) return Uint8Array.from(v as number[]); // D1 returns BLOBs as number[]
  throw new Error('unexpected blob type');
}

function b64decode(s: string): Bytes {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const isRiff = (b: Uint8Array) => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46;

/** Wrap raw 16-bit little-endian mono PCM in a WAV header. */
export function pcmToWav(pcm: Uint8Array, rate = 24000, channels = 1): Bytes {
  const out = new Uint8Array(44 + pcm.length);
  const dv = new DataView(out.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, channels, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * channels * 2, true); dv.setUint16(32, channels * 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

async function upstreamError(r: Response, who: string): Promise<TtsError> {
  let msg = '';
  try { const j = (await r.json()) as { error?: { message?: string } | string }; msg = typeof j.error === 'string' ? j.error : j.error?.message ?? ''; } catch { /* not JSON */ }
  return new TtsError(502, `${who} ${r.status}${msg ? `: ${msg}` : ''}`);
}

async function generate(env: TtsEnv, engine: TtsEngine, variant: TtsVariant, text: string): Promise<{ bytes: Bytes; mime: string }> {
  const f = env.FETCH ?? ((u: string, i: RequestInit) => fetch(u, i));
  if (engine === 'openai') {
    const key = env.OPENAI_API_KEY;
    if (!key) throw new TtsError(503, 'OPENAI_API_KEY not set', { help: SECRET_HELP });
    const r = await f(OPENAI_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(openaiBody(variant, text)),
    });
    if (!r.ok) throw await upstreamError(r, 'OpenAI');
    return { bytes: new Uint8Array(await r.arrayBuffer()), mime: 'audio/mpeg' };
  }
  const key = env.GEMINI_API_KEY;
  if (!key) throw new TtsError(503, 'GEMINI_API_KEY not set', { help: SECRET_HELP });
  const r = await f(geminiUrl(), {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify(geminiBody(variant, text)),
  });
  if (!r.ok) throw await upstreamError(r, 'Gemini');
  const j = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!part?.data) throw new TtsError(502, 'Gemini returned no audio');
  const raw = b64decode(part.data);
  if (isRiff(raw)) return { bytes: raw, mime: 'audio/wav' };
  const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? '')?.[1] ?? 24000);
  return { bytes: pcmToWav(raw, rate), mime: 'audio/wav' };
}

function audioResponse(bytes: Bytes, mime: string, key: string, cache: 'hit' | 'miss' | 'skip'): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': mime, 'content-length': String(bytes.byteLength), 'x-tts-key': key, 'x-tts-cache': cache,
      // content-addressed: the key changes when model, voice, prompt or text change
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
}

/** D1 rows top out at 2 MB; larger clips are returned but not cached. */
const MAX_CACHE_BYTES = 1_900_000;

async function readJson(req: Request): Promise<unknown> {
  const t = await req.text();
  if (t.length > 8192) throw new TtsError(413, 'Body too large');
  try { return JSON.parse(t); } catch { throw new TtsError(400, 'Body is not valid JSON'); }
}

/* ---------------- handlers ---------------- */

async function postTts(req: Request, env: TtsEnv): Promise<Response> {
  const b = (await readJson(req)) as Partial<Record<string, unknown>> | null;
  const engine = b?.['engine'], variant = b?.['variant'], text = b?.['text'];
  if (engine !== 'openai' && engine !== 'gemini') throw new TtsError(400, 'engine must be openai or gemini');
  if (variant !== 'pseudo' && variant !== 'plain') throw new TtsError(400, 'variant must be pseudo or plain');
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TTS_TEXT) throw new TtsError(400, `text must be 1–${MAX_TTS_TEXT} characters`);
  const clean = text.normalize('NFC').trim();
  const key = await ttsKey(engine, variant, clean);
  const hit = await env.DB.prepare('SELECT mime, bytes FROM tts_cache WHERE key = ?1').bind(key).first<{ mime: string; bytes: unknown }>();
  if (hit) return audioResponse(toBytes(hit.bytes), hit.mime, key, 'hit');
  const { bytes, mime } = await generate(env, engine, variant, clean);
  if (bytes.byteLength > MAX_CACHE_BYTES) return audioResponse(bytes, mime, key, 'skip');
  await env.DB.prepare('INSERT OR REPLACE INTO tts_cache (key, engine, variant, text, mime, bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(key, engine, variant, clean, mime, bytes, new Date().toISOString()).run();
  return audioResponse(bytes, mime, key, 'miss');
}

async function getAudio(key: string, db: D1Like): Promise<Response> {
  if (!/^[0-9a-f]{32}$/.test(key)) throw new TtsError(400, 'bad key');
  const row = await db.prepare('SELECT mime, bytes FROM tts_cache WHERE key = ?1').bind(key).first<{ mime: string; bytes: unknown }>();
  if (!row) throw new TtsError(404, 'not generated');
  return audioResponse(toBytes(row.bytes), row.mime, key, 'hit');
}

async function listCache(db: D1Like): Promise<Response> {
  const { results } = await db.prepare('SELECT key, engine, variant, text, mime, created_at FROM tts_cache ORDER BY created_at').all<TtsClipInfo>();
  return json({ clips: results });
}

export function parseRating(v: unknown): TtsRating {
  const r = v as Partial<Record<string, unknown>> | null;
  if (!r || typeof r !== 'object') throw new TtsError(400, 'Expected a rating object');
  const { item, engine, variant, score, problems, note } = r;
  if (typeof item !== 'string' || !/^[\w:.-]{1,64}$/.test(item)) throw new TtsError(422, 'bad item');
  if (typeof engine !== 'string' || !RATED_ENGINES.has(engine)) throw new TtsError(422, 'bad engine');
  if (typeof variant !== 'string' || !RATED_VARIANTS.has(variant)) throw new TtsError(422, 'bad variant');
  if (score !== null && score !== undefined && !(Number.isInteger(score) && (score as number) >= 1 && (score as number) <= 5)) throw new TtsError(422, 'score must be 1–5 or null');
  const ps = problems ?? [];
  if (!Array.isArray(ps) || ps.some((p) => !(PROBLEMS as readonly unknown[]).includes(p))) throw new TtsError(422, `problems must be among ${PROBLEMS.join(', ')}`);
  const n = note ?? '';
  if (typeof n !== 'string' || n.length > 2000) throw new TtsError(422, 'note must be a string of at most 2000 characters');
  return { item, engine, variant, score: (score as number | null | undefined) ?? null, problems: [...new Set(ps as Problem[])], note: n };
}

async function postRating(req: Request, db: D1Like): Promise<Response> {
  const r = parseRating(await readJson(req));
  await db.prepare(
    `INSERT INTO tts_ratings (item, engine, variant, score, problems, note, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(item, engine, variant) DO UPDATE SET score = excluded.score, problems = excluded.problems, note = excluded.note, updated_at = excluded.updated_at`,
  ).bind(r.item, r.engine, r.variant, r.score, JSON.stringify(r.problems), r.note, new Date().toISOString()).run();
  return json({ ok: true });
}

async function listRatings(db: D1Like): Promise<Response> {
  const { results } = await db.prepare('SELECT item, engine, variant, score, problems, note, updated_at FROM tts_ratings ORDER BY item, engine, variant')
    .all<Omit<TtsRatingRow, 'problems'> & { problems: string }>();
  const ratings: TtsRatingRow[] = results.map((r) => {
    let problems: Problem[] = [];
    try { problems = JSON.parse(r.problems) as Problem[]; } catch { /* ignore */ }
    return { ...r, score: r.score === null ? null : Number(r.score), problems };
  });
  return json({ ratings });
}

export const isTtsPath = (pathname: string): boolean => pathname === TTS_API.base || pathname.startsWith(TTS_API.base + '/');

export async function handleTts(req: Request, env: TtsEnv, ctx?: ApiCtx): Promise<Response> {
  try {
    const who = await identifyDetailed(env, ctx, req);
    if (!('email' in who)) return json({ error: 'forbidden', reason: who.reason }, 403);
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    const m = req.method.toUpperCase();
    if (path === TTS_API.status) {
      if (m !== 'GET') return json({ error: 'method not allowed' }, 405);
      const s: TtsStatus = { openai: !!env.OPENAI_API_KEY, gemini: !!env.GEMINI_API_KEY };
      return json(s);
    }
    await ensureTtsSchema(env.DB);
    const route = `${m} ${path}`;
    if (path.startsWith(TTS_API.audio)) {
      if (m !== 'GET') return json({ error: 'method not allowed' }, 405);
      return await getAudio(path.slice(TTS_API.audio.length), env.DB);
    }
    switch (route) {
      case `POST ${TTS_API.base}`: return await postTts(req, env);
      case `GET ${TTS_API.cache}`: return await listCache(env.DB);
      case `POST ${TTS_API.rating}`: return await postRating(req, env.DB);
      case `GET ${TTS_API.ratings}`: return await listRatings(env.DB);
    }
    const known = [TTS_API.base, TTS_API.cache, TTS_API.rating, TTS_API.ratings] as string[];
    return known.includes(path) ? json({ error: 'method not allowed' }, 405) : json({ error: 'not found' }, 404);
  } catch (e) {
    if (e instanceof TtsError) return json({ error: e.message, ...e.extra }, e.status);
    console.error('tts error', e);
    return json({ error: 'internal error' }, 500);
  }
}
