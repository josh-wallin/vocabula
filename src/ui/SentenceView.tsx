/** Sentence exercises: cloze, tap the subject / object, and tile building (Latin → English, English → Latin). */
import { tapCounts, type SentenceExercise } from '../engine/sentences.ts';
import type { Outcome } from '../engine/session.ts';
import type { AudioRef } from '../audio/items.ts';
import { ListenCue, Speaker } from './Speaker.tsx';

interface Props {
  ex: SentenceExercise;
  picked: string[];
  setPicked: (p: string[]) => void;
  outcome: Outcome | null;
  /** Clip that may play before answering (Latin → English, subject / object). */
  speak?: AudioRef | null;
}

export function SentenceView({ ex, picked, setPicked, outcome, speak }: Props) {
  const listening = ex.kind === 'listen' || ex.kind === 'dictate';
  return (
    <div class="sent" data-sentence={ex.sentence} data-kind={ex.kind}>
      <span class="eyebrow" lang="la">{listening ? 'Audī · Sententia' : 'Sententia'}</span>
      <h1 class="prompt">{ex.prompt}</h1>
      {speak && !outcome && (ex.kind === 'subj' || ex.kind === 'obj') && <div class="with-speaker"><Speaker key={speak.key} audio={speak} label="Listen to the sentence" /></div>}
      {ex.kind === 'cloze' && <Cloze ex={ex} picked={picked} setPicked={setPicked} outcome={outcome} />}
      {(ex.kind === 'subj' || ex.kind === 'obj') && <TapRole ex={ex} picked={picked} setPicked={setPicked} outcome={outcome} />}
      {(ex.kind === 'en' || ex.kind === 'la' || listening) && <Tiles ex={ex} picked={picked} setPicked={setPicked} outcome={outcome} speak={speak ?? null} />}
    </div>
  );
}

function optClass(isAns: boolean, sel: boolean, outcome: Outcome | null, base: string): string {
  if (!outcome) return base;
  if (isAns && sel) return `${base} right`;
  if (isAns) return `${base} right missed`;
  if (sel) return `${base} wrong`;
  return base;
}

function Cloze({ ex, picked, setPicked, outcome }: Props) {
  const chosen = ex.options.find((o) => o.id === picked[0]);
  return (
    <>
      <p class="sent-line" lang="la" data-testid="cue">
        {ex.words.map((w, i) => (
          <span key={i}>{i > 0 ? ' ' : ''}{w.blank
            ? <span class={`blank${chosen ? ' filled' : ''}`} data-testid="blank">{chosen ? (i === 0 ? chosen.text.charAt(0).toUpperCase() + chosen.text.slice(1) : chosen.text) : '\u00a0'}</span>
            : w.text}</span>
        ))}
        {ex.s.punct ?? '.'}
      </p>
      <p class="sent-en">{ex.en}</p>
      <div class="options grid2" role="radiogroup" aria-label="Forms">
        {ex.options.map((o) => {
          const isAns = ex.answer.includes(o.id);
          const sel = picked.includes(o.id);
          return (
            <button key={o.id} type="button" class={optClass(isAns, sel, outcome, 'opt')} lang="la"
              aria-pressed={!outcome && sel ? 'true' : 'false'} data-option={o.id} data-answer={isAns ? '1' : '0'}
              disabled={!!outcome} onClick={() => setPicked([o.id])}>{o.text}</button>
          );
        })}
      </div>
    </>
  );
}

function TapRole({ ex, picked, setPicked, outcome }: Props) {
  const toggle = (id: string) => {
    if (outcome) return;
    if (!ex.multi) { setPicked([id]); return; }
    if (id === 'none') { setPicked(['none']); return; }
    const rest = picked.filter((x) => x !== 'none');
    setPicked(rest.includes(id) ? rest.filter((x) => x !== id) : [...rest, id]);
  };
  const words = ex.options.filter((o) => o.id !== 'none');
  const none = ex.options.find((o) => o.id === 'none');
  return (
    <>
      {ex.multi && <span class="select-all">Select all that fit</span>}
      <div class="sent-words" role={ex.multi ? 'group' : 'radiogroup'} aria-label="Words">
        {words.map((o) => {
          const isAns = ex.answer.includes(o.id);
          const sel = picked.includes(o.id);
          // A word agreeing with the subject (hic in hic morbus) counts like the subject itself.
          const counts = tapCounts(ex, o.id, picked).right;
          return (
            <button key={o.id} type="button" class={optClass(counts, sel, outcome, 'wordchip')} lang="la"
              aria-pressed={!outcome && sel ? 'true' : 'false'} data-option={o.id} data-answer={isAns ? '1' : '0'}
              disabled={!!outcome} onClick={() => toggle(o.id)}>{o.text}</button>
          );
        })}
        <span class="sent-punct">{ex.s.punct ?? '.'}</span>
      </div>
      {none && (
        <button type="button" class={optClass(ex.answer.includes('none'), picked.includes('none'), outcome, 'opt')}
          aria-pressed={!outcome && picked.includes('none') ? 'true' : 'false'} data-option="none"
          data-answer={ex.answer.includes('none') ? '1' : '0'} disabled={!!outcome} onClick={() => toggle('none')}>{none.text}</button>
      )}
    </>
  );
}

function Tiles({ ex, picked, setPicked, outcome, speak }: Props) {
  // Latin tiles for English → Latin and for dictation; English tiles otherwise.
  const la = ex.kind === 'la' || ex.kind === 'dictate';
  const text = (id: string) => ex.options.find((o) => o.id === id)?.text ?? '';
  const latinLine = <span class="la-big" lang="la" data-testid="cue">{ex.s.tokens.map((t, i) => (t.form + (t.attach ?? '')) + (t.comma && i < ex.s.tokens.length - 1 ? ',' : '')).join(' ').replace(/^./, (c) => c.toUpperCase())}{ex.s.punct ?? '.'}</span>;
  return (
    <>
      <div class="cue">
        {ex.audio && !outcome
          ? <ListenCue audio={ex.audio} />
          : ex.audio
            ? <>{latinLine}<span class="hint">{ex.en}</span></>
            : la
              ? <span class="en-big" lang="en" data-testid="cue">{ex.en}</span>
              : <span class="with-speaker"><span class="la-big" lang="la" data-testid="cue">{ex.words.map((w) => w.text).join(' ')}{ex.s.punct ?? '.'}</span>
                {speak && !outcome && <Speaker key={speak.key} audio={speak} label="Listen to the sentence" />}</span>}
      </div>
      <div class={`tile-answer${outcome ? (outcome.ok ? ' ok' : ' bad') : ''}`} aria-label="Your answer" data-testid="tile-answer">
        {picked.length === 0 && <span class="tile-placeholder">Tap the words in order</span>}
        {picked.map((id, i) => (
          <button key={`${id}-${i}`} type="button" class="tile placed" lang={la ? 'la' : 'en'} disabled={!!outcome}
            data-tile={id} onClick={() => setPicked(picked.filter((_, k) => k !== i))}>{text(id)}</button>
        ))}
      </div>
      <div class="tile-bank" aria-label="Word bank">
        {ex.options.map((o) => {
          const used = picked.includes(o.id);
          return (
            <button key={o.id} type="button" class={`tile${used ? ' used' : ''}`} lang={la ? 'la' : 'en'}
              disabled={used || !!outcome} aria-hidden={used ? 'true' : undefined} data-tile={o.id}
              onClick={() => setPicked([...picked, o.id])}>{o.text}</button>
          );
        })}
      </div>
    </>
  );
}
