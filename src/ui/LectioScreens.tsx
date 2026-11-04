/**
 * Lectiō screens: the context card and the passage read sentence by sentence (speaker, tap any
 * word for its gloss and parse, "Show translation" per sentence), plus the reader used to reread
 * a finished passage (Words → Lectiōnēs). Its own chunk, loaded through src/ui/Lectio.tsx.
 */
import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import type { AppData } from '../app/controller.ts';
import { roman } from '../engine/curriculum.ts';
import { lectioText, lectioWord, wordInfo, type Lectio, type LectioScreen } from '../engine/lectio.ts';
import { formAudio } from '../audio/items.ts';
import { Speaker } from './Speaker.tsx';
import { IconBack } from './icons.tsx';

/** The audio of sentence i (eSpeak, key of its printed text). */
export const lectioSentenceAudio = (p: Lectio, i: number) => formAudio(lectioText(p.sentences[i]!));

export function LectioView({ app, ex, autoplay }: { app: AppData; ex: LectioScreen; autoplay: boolean }) {
  const p = ex.passage;
  if (ex.kind === 'context') {
    return (
      <div class="lectio" data-lectio="context">
        <span class="eyebrow" lang="la">Lectiō · Sectiō {roman(p.section)}</span>
        <h1 class="prompt lectio-title" lang="la">{p.title}</h1>
        <p class="lectio-title-en">{p.titleEn}</p>
        <p class="audit-context">{p.context}</p>
        <p class="note">
          You’ll read {p.sentences.length} short sentences, one at a time, using only words and endings you know. Tap any word
          for its meaning and form; each sentence can be heard and has its translation. Then {p.questions.length} questions.
        </p>
      </div>
    );
  }
  return (
    <div class="lectio" data-lectio="read" data-index={ex.index}>
      <span class="eyebrow" lang="la">Lectiō · {p.title}</span>
      <Passage key={p.id} app={app} p={p} upTo={ex.index} autoplay={autoplay} />
    </div>
  );
}

/**
 * The passage up to sentence `upTo` (all of it when undefined). The last one shown is the
 * current sentence; earlier ones stay above, dimmed. One gloss panel for the whole passage.
 */
export function Passage({ app, p, upTo, autoplay = false }: { app: AppData; p: Lectio; upTo?: number; autoplay?: boolean }) {
  const [sel, setSel] = useState<{ s: number; t: number } | null>(null);
  const [shown, setShown] = useState<ReadonlySet<number>>(new Set());
  const last = upTo ?? p.sentences.length - 1;
  const info = sel ? wordInfo(app.lex, p, sel.s, sel.t) : null;
  const toggle = (i: number) => setShown((x) => { const n = new Set(x); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <div class="transcript-wrap">
      <div class="lectio-text" data-testid="passage">
        {p.sentences.slice(0, last + 1).map((s, i) => {
          const current = upTo !== undefined && i === last;
          const audio = lectioSentenceAudio(p, i);
          return (
            <div key={i} class={`lsent${current ? ' current' : upTo !== undefined ? ' past' : ''}`} data-testid="lsent">
              <div class="lsent-la" lang="la">
                {s.speaker && <span class="lspeaker">{s.speaker}: </span>}
                {s.tokens.map((_, t) => {
                  const on = sel?.s === i && sel.t === t;
                  const w = lectioWord(s, t);
                  const word = w.replace(/,$/, '');
                  return (
                    <Fragment key={t}>
                      <button type="button" class={`tok${on ? ' on' : ''}${s.tokens[t]!.proper ? ' proper' : ''}`} data-testid="tok" aria-pressed={on ? 'true' : 'false'}
                        onClick={() => setSel(on ? null : { s: i, t })}>{word}</button>
                      {w.endsWith(',') ? ',' : ''}{t === s.tokens.length - 1 ? (s.punct ?? '.') : ' '}
                    </Fragment>
                  );
                })}
                <Speaker key={audio.key} audio={audio} autoplay={current && autoplay} label={`Listen: sentence ${i + 1}`} />
              </div>
              <div class="lsent-tools">
                <button type="button" class="linkbtn" data-testid="show-en" aria-pressed={shown.has(i) ? 'true' : 'false'} onClick={() => toggle(i)}>
                  {shown.has(i) ? 'Hide translation' : 'Show translation'}
                </button>
              </div>
              {shown.has(i) && <p class="lsent-en" data-testid="en">{s.en}</p>}
            </div>
          );
        })}
      </div>
      <div class="tgloss" role="status" aria-live="polite" data-testid="gloss">
        {info ? (
          <>
            <span class="tg-w" lang="la">{info.word}</span> <span class="tg-h" lang="la">{info.head}</span>
            <span class="tg-g">{info.missing ? 'No gloss for this word in your content pack.' : info.gloss}</span>
            {info.parse && <span class="tg-p" data-testid="parse">{info.parse}{info.here ? ` · here ${info.here}` : ''}</span>}
            {info.note && <span class="tg-n">{info.note}</span>}
          </>
        ) : <span class="note">Tap any word for its meaning and form.</span>}
      </div>
    </div>
  );
}

/** Full-screen reader for a finished passage (no questions, nothing graded). */
export function LectioReader({ app, p, onBack }: { app: AppData; p: Lectio; onBack: () => void }) {
  return (
    <div class="screen" data-screen="lectio">
      <header class="lesson-head">
        <button type="button" class="iconbtn" aria-label="Back" onClick={onBack}><IconBack /></button>
        <span class="lesson-tag" lang="la">Lectiō · Sectiō {roman(p.section)}</span>
      </header>
      <div class="scroll">
        <main class="page lectio">
          <h1 lang="la">{p.title}</h1>
          <p class="lectio-title-en">{p.titleEn}</p>
          <p class="note">{p.context}</p>
          <Passage app={app} p={p} />
        </main>
      </div>
    </div>
  );
}
