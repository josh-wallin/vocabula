/**
 * Audio clip keys, shared by the client and the audio pipeline (vocabula-content
 * scripts/audio-*.mts, which keeps an identical copy for app versions without this file).
 *
 *   key = first 24 hex digits of sha256(`${AUDIO_ENGINE}|${AUDIO_VOICE}|${AUDIO_SPEED}|${normalizeAudioText(text)}`)
 *
 * AUDIO_ENGINE names the synthesizer *and* the version of the text pre-processing
 * (see speech.ts): bump it whenever either changes, so every clip is regenerated.
 * Test vector (both repos): audioKey('Amō') === audioKey('amō') === TEST_VECTOR.key.
 *
 * SHA-256 is implemented here (synchronous, pure) because lessons are built synchronously
 * and the same code must run in the browser, the Worker and Node.
 */
export const AUDIO_ENGINE = 'espeak-ng+p1';
export const AUDIO_VOICE = 'la';
/** eSpeak words per minute (default 175; slower for learners). */
export const AUDIO_SPEED = 130;
export const AUDIO_KEY_LEN = 24;
export const AUDIO_PATH = '/api/audio/';

/** NFC, lowercase, single spaces, trimmed. Punctuation is kept (it shapes intonation). */
export function normalizeAudioText(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function audioKey(text: string): string {
  return sha256Hex(`${AUDIO_ENGINE}|${AUDIO_VOICE}|${AUDIO_SPEED}|${normalizeAudioText(text)}`).slice(0, AUDIO_KEY_LEN);
}

export const audioUrl = (key: string): string => `${AUDIO_PATH}${key}`;
export const isAudioKey = (s: string): boolean => new RegExp(`^(?:${EXTERNAL_AUDIO_PREFIX}|${GEMINI_AUDIO_PREFIX})?[0-9a-f]{${AUDIO_KEY_LEN}}$`).test(s);

/**
 * Gemini clips (the bulk pipeline: vocabula-content scripts/audio-gemini.mts) are stored in the
 * same D1 table under `gm-` + the first 24 hex digits of
 * sha256(`${geminiAudioEngine(text)}|la|${normalizeAudioText(text)}`), next to the eSpeak clip of the
 * same text, which stays as the fallback. The engine id names model, voice, the variant used for
 * that text and the prompt version: changing any of them gives the clip a new key.
 * The request itself (style prompt, input pre-processing) is src/audio/gemini.ts geminiBody().
 */
export const GEMINI_AUDIO_PREFIX = 'gm-';
export const GEMINI_MODEL = 'gemini-3.8-flash-tts';
export const GEMINI_VOICE = 'Charon';
/** Bump when the instructions or pre-processing change (also keys the voice-test cache, worker/tts.ts). */
export const GEMINI_PROMPT_VERSION = 'p1';

export type GeminiAudioVariant = 'plain' | 'aspirated';
/**
 * How the app's clips pick a voice-test variant. 'hybrid' (the spot-check's result): `aspirated`
 * (ph/th/ch sent as pʰ/tʰ/kʰ, with the ʰ note in the prompt) only for texts that contain ph, th or ch;
 * `plain` for everything else, because the ʰ note primed English "ch" for plain c (amīcī, pācem).
 * 'plain' / 'aspirated' force one variant everywhere.
 */
export const GEMINI_AUDIO_MODE: GeminiAudioVariant | 'hybrid' = 'hybrid';

/** ph / th / ch in a word, except post-h compounds (posthāc). Mirrors src/audio/gemini.ts aspirate(). */
export const NOT_ASPIRATE_WORD = /^posth/i;
export const ASPIRATE_PAIR = /[pPtTcC][hH]/;
export const hasAspirate = (text: string): boolean =>
  (text.normalize('NFC').match(/\p{L}+/gu) ?? []).some((w) => !NOT_ASPIRATE_WORD.test(w) && ASPIRATE_PAIR.test(w));

/** The variant a text's clip is made with (client and bulk pipeline both call this). */
export function geminiVariantFor(text: string, mode: GeminiAudioVariant | 'hybrid' = GEMINI_AUDIO_MODE): GeminiAudioVariant {
  return mode === 'hybrid' ? (hasAspirate(text) ? 'aspirated' : 'plain') : mode;
}
export const geminiEngineId = (variant: GeminiAudioVariant): string => `${GEMINI_MODEL}+${GEMINI_VOICE}+${variant}+${GEMINI_PROMPT_VERSION}`;
/** The engine id in a text's key: model + voice + its variant + prompt version. */
export const geminiAudioEngine = (text: string): string => geminiEngineId(geminiVariantFor(text));
export const geminiAudioKeyInput = (text: string, engine: string = geminiAudioEngine(text)): string => `${engine}|la|${normalizeAudioText(text)}`;
export const geminiAudioKey = (text: string, engine: string = geminiAudioEngine(text)): string =>
  GEMINI_AUDIO_PREFIX + sha256Hex(geminiAudioKeyInput(text, engine)).slice(0, AUDIO_KEY_LEN);

/**
 * Human recordings (Audītiō lessons, from Dickinson College Commentaries) are stored under
 * `dcc-` + the first 24 hex digits of sha256(the source MP3 URL, exactly as written), by the
 * vocabula-content audio Action (scripts/audio-external.mts), engine 'dcc'.
 */
export const EXTERNAL_AUDIO_PREFIX = 'dcc-';
export const externalAudioKey = (url: string): string => EXTERNAL_AUDIO_PREFIX + sha256Hex(url).slice(0, AUDIO_KEY_LEN);

/** Shared test vector (also asserted in vocabula-content). */
export const TEST_VECTOR = { text: 'Amō', input: 'espeak-ng+p1|la|130|amō', key: 'fb92e07d84a2cd968a353adf' } as const;
/** Gemini key test vector for a fixed engine id (also asserted in vocabula-content). */
export const GEMINI_TEST_VECTOR = { text: 'Amō', engine: 'gemini-3.8-flash-tts+Charon+plain+p1', input: 'gemini-3.8-flash-tts+Charon+plain+p1|la|amō', key: 'gm-1d3b43ab0fcb022ca480b9e7' } as const;
/** Hybrid vectors (also asserted in vocabula-content): a ph text is keyed with `aspirated`, the rest with `plain`. */
export const GEMINI_HYBRID_VECTORS = [
  { text: 'Amō', variant: 'plain', key: 'gm-1d3b43ab0fcb022ca480b9e7' },
  { text: 'Sine philosophiā errās.', variant: 'aspirated', key: 'gm-7fd128adc69c05eb5cde4b9f' },
  { text: 'posthāc', variant: 'plain', key: 'gm-6dcd56b7060cfbcf5196e559' },
] as const;

/* ---------------- SHA-256 (FIPS 180-4) over UTF-8 ---------------- */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(text: string): string {
  const msg = new TextEncoder().encode(text);
  const bitLen = msg.length * 8;
  const padded = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!, b = w[i - 2]!;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0; h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0; h[5] = (h[5]! + f) >>> 0; h[6] = (h[6]! + g) >>> 0; h[7] = (h[7]! + hh) >>> 0;
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
}
