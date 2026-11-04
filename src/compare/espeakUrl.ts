/**
 * Where the eSpeak NG clip for a text lives: GET /api/audio/:key, served by the audio
 * branch (worker/audio.ts, D1 table `audio`). That branch defines the key in
 * src/audio/key.ts, which doesn't exist on this branch, so this adapter recomputes it.
 *
 * ASSUMPTION (reconcile on merge, then replace this file's body with
 * `export { audioKey as espeakKey, audioUrl } from '../audio/key.ts'`):
 *
 *   key = first 24 hex digits of sha256(`${ENGINE}|la|130|${normalize(text)}`)
 *   normalize = NFC, lower-case, runs of whitespace → one space, trimmed (punctuation kept)
 *
 * ENGINE is 'espeak-ng+p1', mirroring the audio branch's in-progress key.ts at the time
 * of writing (its test vector: 'Amō' → fb92e07d84a2cd968a353adf, asserted in
 * tests/compare.test.ts). The original brief said 'espeak-ng'; if the audio branch settles
 * on a different engine tag or normalization, change ESPEAK_ENGINE / normalizeEspeakText.
 *
 * Only texts that the audio pipeline has rendered have clips; for the rest the page shows
 * "no eSpeak clip".
 */
export const ESPEAK_ENGINE = 'espeak-ng+p1';
export const ESPEAK_VOICE = 'la';
export const ESPEAK_SPEED = 130;
export const ESPEAK_KEY_LEN = 24;

export function normalizeEspeakText(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export const espeakKeyInput = (text: string): string =>
  `${ESPEAK_ENGINE}|${ESPEAK_VOICE}|${ESPEAK_SPEED}|${normalizeEspeakText(text)}`;

/** WebCrypto SHA-256 (browser, Worker and Node ≥ 20). */
export async function espeakKey(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(espeakKeyInput(text)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, ESPEAK_KEY_LEN);
}

export async function espeakUrl(text: string): Promise<string> {
  return `/api/audio/${await espeakKey(text)}`;
}
