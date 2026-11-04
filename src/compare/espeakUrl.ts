/**
 * Where the eSpeak NG clip for a text lives: GET /api/audio/:key (worker/audio.ts, D1 table
 * `audio`). The key is the app's own (src/audio/key.ts); this module only adapts its names for
 * the voice-test page. The compare items are in the audio manifest (src/audio/items.ts), so the
 * pipeline renders a clip for each.
 */
import { AUDIO_ENGINE, AUDIO_SPEED, AUDIO_VOICE, audioKey, audioUrl, normalizeAudioText } from '../audio/key.ts';

export { audioKey as espeakKey, normalizeAudioText as normalizeEspeakText };

export const espeakKeyInput = (text: string): string => `${AUDIO_ENGINE}|${AUDIO_VOICE}|${AUDIO_SPEED}|${normalizeAudioText(text)}`;

/** Kept async for the page's existing call sites. */
export async function espeakUrl(text: string): Promise<string> {
  return audioUrl(audioKey(text));
}
