/**
 * The Gemini text-to-speech request, shared by the voice test (worker/tts.ts, #/compare) and the
 * bulk clip pipeline (vocabula-content scripts/audio-gemini.mts, which imports this file from the
 * app checkout), so the clips the owner rated are made exactly the way the app's clips will be.
 * Pure: no Worker or Node APIs. Model, voice and prompt version live in key.ts (they key the clips).
 *
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   {contents: [{role: 'user', parts: [{text, speech_metadata: {style}}]}],
 *    generationConfig: {responseModalities: ['AUDIO'], speechConfig: {voiceConfig: {voice}}}}
 *   → candidates[0].content.parts[].inlineData {mimeType, data} (base64; WAV, or raw 16-bit PCM)
 *   https://ai.google.dev/gemini-api/docs/generate-content/speech-generation (checked 2026-11-04)
 *
 * Variants:
 *  - plain: macronized Latin as written + the classical-pronunciation style prompt.
 *  - aspirated: plain, but ph / th / ch are respelled pʰ / tʰ / kʰ (modifier letter ʰ) with a note
 *    in the style prompt. The plain variant's one bad item in the voice test was "philosophia,
 *    theātrum", read with English f and θ: a familiar spelling pulls the model to the English
 *    word. If the model ignores the ʰ, it still says p / t / k, never f / θ.
 *  - pseudo: the respelling of src/compare/pseudo.ts (k, w, doubled long vowels, CAPITAL stress).
 */
import { toPseudo } from '../compare/pseudo.ts';
import { GEMINI_MODEL, GEMINI_VOICE } from './key.ts';

export type GeminiVariant = 'plain' | 'aspirated' | 'pseudo';
export const GEMINI_VARIANTS: readonly GeminiVariant[] = ['plain', 'aspirated', 'pseudo'];

export const geminiUrl = (model = GEMINI_MODEL): string => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export const CLASSICAL_RULES =
  'Use the restored classical pronunciation of the late Republic (W. Sidney Allen, Vox Latina), not Church or English Latin: ' +
  'c and g always hard (k, g), even before e and i; v is English w; consonantal i is English y; qu is kw; ' +
  'ae as in "eye", oe as in "oil", au as in "cow"; ph, th, ch are aspirated p, t, k, not f or th; h is a light breath; ' +
  'r is tapped; s is always voiceless. Vowels are pure, as in Italian, with no English reduction. ' +
  'Long vowels (written with a macron) last about twice as long as short ones, with the same quality. ' +
  'Double consonants are held. Stress the second-to-last syllable when it is long, otherwise the third-to-last.';

const PLAIN_STYLE = 'Read this as Latin (language: la), slowly and clearly, like a Latin teacher modelling pronunciation. ' + CLASSICAL_RULES;

export const GEMINI_STYLE: Record<GeminiVariant, string> = {
  plain: PLAIN_STYLE,
  aspirated:
    PLAIN_STYLE +
    ' In this text the letter ʰ after p, t or k marks aspiration: pʰ is a p with a puff of breath, as in English "pot", never f; ' +
    'tʰ is a t with a puff of breath, as in English "top", never the th of "thin" or "this"; kʰ is a k with a puff of breath, as in "cot". ' +
    'Do not say ʰ as a separate sound or a letter name.',
  pseudo:
    'Read this as Latin respelled for pronunciation (language: la), slowly and clearly, like a Latin teacher. ' +
    'Doubled vowels are long with Italian quality; the CAPITAL syllable with a grave accent is stressed; w and y as in English.',
};

/** Words where t + h is a prefix boundary (post-hāc), not the Greek aspirate. */
const NOT_ASPIRATE = /^posth/i;
const ASPIRATE_CAP: Record<string, string> = { p: 'p', P: 'P', t: 't', T: 'T', c: 'k', C: 'K' };

/** ph → pʰ, th → tʰ, ch → kʰ (case kept: Ph → Pʰ, Ch → Kʰ). Everything else unchanged. */
export function aspirate(text: string): string {
  return text.normalize('NFC').replace(/\p{L}+/gu, (w) => (NOT_ASPIRATE.test(w) ? w : w.replace(/([pPtTcC])[hH]/g, (_, c: string) => `${ASPIRATE_CAP[c]}ʰ`)));
}

/** The text actually sent to Gemini for a variant. */
export function geminiInput(variant: GeminiVariant, text: string): string {
  if (variant === 'pseudo') return toPseudo(text);
  if (variant === 'aspirated') return aspirate(text);
  return text;
}

export function geminiBody(variant: GeminiVariant, text: string, voice: string = GEMINI_VOICE) {
  return {
    contents: [{ role: 'user', parts: [{ text: geminiInput(variant, text), speech_metadata: { style: GEMINI_STYLE[variant] } }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice } } },
  };
}

/* ---------------- response ---------------- */

export interface GeminiResponse {
  candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  promptFeedback?: { blockReason?: string };
}

/** The audio part of a generateContent response, or null (no audio: blocked, empty, text only). */
export function geminiAudioPart(j: GeminiResponse): { data: string; mimeType: string } | null {
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  return part?.data ? { data: part.data, mimeType: part.mimeType ?? '' } : null;
}

/** Sample rate from an inlineData mimeType such as "audio/L16;codec=pcm;rate=24000" (default 24 kHz). */
export const pcmRate = (mimeType: string): number => Number(/rate=(\d+)/.exec(mimeType)?.[1] ?? 24000);

/** RIFF header? (Gemini may send WAV instead of raw PCM.) */
export const isRiff = (b: Uint8Array): boolean => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46;

/** Wrap raw 16-bit little-endian PCM in a WAV header. */
export function pcmToWav(pcm: Uint8Array, rate = 24000, channels = 1): Uint8Array<ArrayBuffer> {
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
