/**
 * "Bad audio" reports. Long-press (or right-click) any speaker, or pick "Bad audio" in a lesson's
 * flag sheet: a `flag` event {ref: 'audio:<the key that played>', reason: 'bad-audio', shown: <text>}.
 * The vocabula-content audio-gemini workflow reads these flags and reverts the clip to eSpeak
 * (revert_flagged: a blocklist in the index, nothing deleted) or regenerates it (redo_flagged).
 * The App registers the reporter (recordFlag) once its data is loaded; without one, speakers
 * behave exactly as before.
 */
import { useState } from 'preact/hooks';
import type { FlagBody } from '../engine/events.ts';
import { MAX_FLAG_NOTE_LEN, MAX_FLAG_SHOWN_LEN } from '../engine/eventShape.ts';
import type { AudioRef } from '../audio/items.ts';
import { GEMINI_AUDIO_PREFIX } from '../audio/key.ts';

type Reporter = (b: FlagBody) => void;
let reporter: Reporter | null = null;
export const setAudioReporter = (r: Reporter | null): void => { reporter = r; };
export const canReportAudio = (): boolean => reporter !== null;

export const engineName = (key: string): string => (key.startsWith(GEMINI_AUDIO_PREFIX) ? 'Gemini' : key.startsWith('dcc-') ? 'recording' : 'eSpeak');

export function audioFlagBody(audio: Pick<AudioRef, 'text'>, playedKey: string, note = '', node?: string): FlagBody {
  const body: FlagBody = { ref: `audio:${playedKey}`, reason: 'bad-audio', shown: audio.text.slice(0, MAX_FLAG_SHOWN_LEN) };
  const n = note.trim().slice(0, MAX_FLAG_NOTE_LEN);
  if (n) body.note = n;
  if (node) body.node = node;
  return body;
}

export function reportAudio(body: FlagBody): boolean {
  if (!reporter) return false;
  reporter(body);
  return true;
}

/** Bottom sheet: what played (text + engine), an optional note, Send. */
export function AudioReportSheet({ audio, playedKey, onClose }: { audio: Pick<AudioRef, 'text'>; playedKey: string; onClose: (sent: boolean) => void }) {
  const [note, setNote] = useState('');
  return (
    <div class="sheet-wrap" onClick={(e) => e.stopPropagation()}>
      <button type="button" class="sheet-scrim" aria-label="Close" onClick={() => onClose(false)} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Report bad audio" data-testid="audio-report-sheet">
        <span class="grip" />
        <span class="t">Report bad audio</span>
        <p class="audio-report-text"><span lang="la">{audio.text}</span> <span class="hint">({engineName(playedKey)})</span></p>
        <label class="field-label" for="audio-report-note">What’s wrong? (optional)</label>
        <textarea id="audio-report-note" class="paste flag-note" maxLength={MAX_FLAG_NOTE_LEN} value={note}
          placeholder="e.g. c sounds like ch, wrong stress" onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
        <button type="button" class="btn" data-testid="audio-report-send"
          onClick={() => { reportAudio(audioFlagBody(audio, playedKey, note)); onClose(true); }}>Send report</button>
      </div>
    </div>
  );
}
