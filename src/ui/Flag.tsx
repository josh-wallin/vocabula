/** Flag button + bottom sheet: report a wrong answer, bad Latin, bad English or anything else on an exercise. */
import { useState } from 'preact/hooks';
import type { Exercise } from '../engine/lesson.ts';
import type { FlagBody, FlagReason } from '../engine/events.ts';
import { FLAG_REASONS, MAX_FLAG_NOTE_LEN, MAX_FLAG_SHOWN_LEN } from '../engine/eventShape.ts';
import { latinText } from '../engine/sentences.ts';

export const FLAG_LABEL: Record<FlagReason, string> = {
  'wrong-answer': 'The expected answer is wrong',
  'bad-latin': 'Bad Latin',
  'bad-english': 'Bad English',
  other: 'Something else',
};

/** What a flag points at: the exercise's card, or the word / grammar card shown. */
export function flagRef(ex: Exercise): string {
  switch (ex.type) {
    case 'intro': return `lemma:${ex.lemma}`;
    case 'grammar': return `grammar:${ex.section}`;
    default: return ex.card;
  }
}

/** A short description of what the screen showed, so a flag can be understood later. */
export function flagShown(ex: Exercise): string {
  let s: string;
  switch (ex.type) {
    case 'intro': s = `New word ${ex.lemma}`; break;
    case 'grammar': s = `Grammar card ${ex.section}`; break;
    case 'sentence': s = `${ex.prompt}: ${latinText(ex.s)} = ${ex.en} [${ex.options.map((o) => o.text).join(' / ')}]`; break;
    case 'choice': s = `${ex.prompt} ${ex.cue} [${ex.options.map((o) => o.text).join(' / ')}]`; break;
    case 'typed': s = `${ex.prompt} ${ex.cue} (${ex.accepted.join(' / ')})`; break;
  }
  return s.slice(0, MAX_FLAG_SHOWN_LEN);
}

export function FlagSheet({ ex, node, onSend, onClose }: {
  ex: Exercise; node: string; onSend: (b: FlagBody) => void; onClose: () => void;
}) {
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [note, setNote] = useState('');
  const send = () => {
    if (!reason) return;
    const body: FlagBody = { ref: flagRef(ex), reason, shown: flagShown(ex), node };
    const n = note.trim().slice(0, MAX_FLAG_NOTE_LEN);
    if (n) body.note = n;
    onSend(body);
  };
  return (
    <div class="sheet-wrap">
      <button type="button" class="sheet-scrim" aria-label="Close" onClick={onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Flag this exercise" data-testid="flag-sheet">
        <span class="grip" />
        <span class="t">Flag this exercise</span>
        <div class="options" role="radiogroup" aria-label="Reason">
          {FLAG_REASONS.map((r) => (
            <button key={r} type="button" class="opt" aria-pressed={reason === r ? 'true' : 'false'} data-reason={r}
              onClick={() => setReason(r)}>{FLAG_LABEL[r]}</button>
          ))}
        </div>
        <label class="field-label" for="flag-note">Note (optional)</label>
        <textarea id="flag-note" class="paste flag-note" maxLength={MAX_FLAG_NOTE_LEN} value={note}
          placeholder="What’s wrong?" onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
        <button type="button" class="btn" disabled={!reason} onClick={send} data-testid="flag-send">Send flag</button>
      </div>
    </div>
  );
}
