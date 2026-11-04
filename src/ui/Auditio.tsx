/**
 * Audītiō screens: context, pre-teach word card, and the two listening screens (a human recording
 * from Dickinson College Commentaries, CC BY-SA, credited on every listening screen).
 */
import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { AppData } from '../app/controller.ts';
import { citation } from '../engine/lexicon.ts';
import { roman } from '../engine/curriculum.ts';
import type { AuditScreen, ListeningLesson, ListeningToken } from '../engine/listening.ts';
import { vocabSay } from '../engine/listening.ts';
import { formAudio } from '../audio/items.ts';
import { loadClip, stopAudio } from '../audio/player.ts';
import { Speaker } from './Speaker.tsx';

const ENCLITIC: Record<string, string> = { que: '-que: and', ne: '-ne: asks a yes/no question', ve: '-ve: or' };

/** The gloss shown for a tapped excerpt word. */
export function tokenGloss(app: Pick<AppData, 'lex'>, l: ListeningLesson, t: ListeningToken): { head: string; gloss: string; known: boolean } | null {
  if (t.vocab) {
    const v = l.vocab.find((x) => x.id === t.vocab);
    return v ? { head: v.headword, gloss: v.gloss + (v.note ? ` (${v.note})` : ''), known: false } : null;
  }
  const w = t.lemma ? app.lex.byId.get(t.lemma) : undefined;
  if (!w) return null;
  const g = w.lemma.gender ? ` ${w.lemma.gender}.` : '';
  return { head: `${citation(w.lemma)}${g}`, gloss: w.lemma.gloss + (t.enclitic ? ` · ${ENCLITIC[t.enclitic]}` : ''), known: true };
}

export function AuditView({ app, ex, autoplay, onReveal, revealed }: {
  app: AppData; ex: AuditScreen; autoplay: boolean; revealed: boolean; onReveal: () => void;
}) {
  const l = ex.lesson;
  if (ex.kind === 'context') {
    const mins = Math.max(1, Math.round(l.audio.seconds / 60));
    return (
      <div class="audit" data-audit="context">
        <span class="eyebrow" lang="la">Audītiō · Sectiō {roman(l.section)}</span>
        <h1 class="prompt">{l.title}</h1>
        <p class="audit-context">{l.context}</p>
        <p class="note">
          You’ll hear {l.audio.reader} read a passage (about {mins} minute{mins > 1 ? 's' : ''}) and listen for one part of it: {l.ref}.
          {l.vocab.some((v) => v.drill) ? ' First, a few words you haven’t met yet.' : ''}
        </p>
      </div>
    );
  }
  if (ex.kind === 'word' && ex.vocab) {
    const v = ex.vocab;
    const [first, ...rest] = v.headword.split(', ');
    return (
      <div class="audit" data-audit="word" data-vocab={v.id}>
        <span class="eyebrow">New word · for this reading</span>
        <div class="wordcard">
          <div class="head">
            <span class="hw" lang="la">{first}</span>
            <Speaker key={v.id} audio={formAudio(vocabSay(v))} autoplay={autoplay} label={`Listen: ${vocabSay(v)}`} />
            {rest.length > 0 && <span class="parts" lang="la">{rest.join(', ')}</span>}
          </div>
          <span class="gloss">{v.gloss}</span>
          <span class="meta">In the reading: <span lang="la">{v.forms.join(', ')}</span>{v.note ? ` · ${v.note}` : ''}</span>
        </div>
        <p class="note">Only for this listening lesson: it won’t come back in your reviews.</p>
      </div>
    );
  }
  const second = ex.kind === 'listen2';
  return (
    <div class="audit" data-audit={ex.kind}>
      <span class="eyebrow" lang="la">Audītiō</span>
      <h1 class="prompt">{second ? 'Listen again, with the text' : 'Listen for the highlighted sentence'}</h1>
      <p class="note">{second
        ? 'Follow the highlighted part as it is read. Tap any of its words for the meaning.'
        : `${l.where} The text appears when the reading ends.`}</p>
      <Recording key={ex.id} lesson={l} autoplay={autoplay} onEnded={onReveal} />
      {!second && !revealed && <button type="button" class="btn secondary" data-testid="show-text" onClick={onReveal}>Show the text</button>}
      {(second || revealed) && <Transcript app={app} lesson={l} tappable={second} />}
      {second && l.notes.length > 0 && (
        <div class="audit-notes">
          {l.notes.map((n) => <p key={n.form} class="note"><span lang="la">{n.form}</span>: {n.gloss}</p>)}
        </div>
      )}
      <Attribution lesson={l} />
    </div>
  );
}

/** Native audio controls (play / pause / seek: the readings are 1½–2½ minutes) over the cached clip. */
function Recording({ lesson, autoplay, onEnded }: { lesson: ListeningLesson; autoplay: boolean; onEnded: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    stopAudio();
    loadClip(lesson.audio.key).then((u) => { if (live) setUrl(u); }, () => { if (live) { setFailed(true); onEnded(); } });
    return () => { live = false; };
  }, [lesson.audio.key]);
  if (failed) {
    return <p class="audit-missing" role="status" data-testid="audio-missing">The recording can’t be played right now (offline, or not on the server yet). Read the text instead; you can come back to listen later.</p>;
  }
  if (!url) return <p class="note" role="status">Loading the recording…</p>;
  return (
    <audio class="audit-audio" controls preload="auto" src={url} autoplay={autoplay} onEnded={onEnded} data-testid="recording"
      aria-label={`Recording: ${lesson.audio.title}`} />
  );
}

function Transcript({ app, lesson, tappable }: { app: AppData; lesson: ListeningLesson; tappable: boolean }) {
  const [sel, setSel] = useState<{ line: number; tok: number } | null>(null);
  const picked = sel ? lesson.transcript[sel.line]?.tokens?.[sel.tok] : undefined;
  const gloss = picked ? tokenGloss(app, lesson, picked) : null;
  return (
    <div class="transcript-wrap">
      <div class="transcript" lang="la" data-testid="transcript">
        {lesson.transcript.map((line, li) => (
          <span key={li} class={line.excerpt ? 'tline excerpt' : 'tline'} data-excerpt={line.excerpt ? '1' : undefined}>
            {line.excerpt && tappable && line.tokens
              ? line.tokens.map((t, ti) => (
                <Fragment key={ti}>
                  <button type="button" class={`tok${sel?.line === li && sel.tok === ti ? ' on' : ''}${t.vocab ? ' new' : ''}`}
                    data-testid="tok" aria-pressed={sel?.line === li && sel.tok === ti ? 'true' : 'false'}
                    onClick={() => setSel(sel?.line === li && sel.tok === ti ? null : { line: li, tok: ti })}>{t.w}</button>
                  {t.p ?? ''}{' '}
                </Fragment>
              ))
              : <>{line.text} </>}
          </span>
        ))}
      </div>
      {tappable && (
        <div class="tgloss" role="status" aria-live="polite" data-testid="gloss">
          {picked && gloss
            ? <><span class="tg-w" lang="la">{picked.w}</span> <span class="tg-h" lang="la">{gloss.head}</span><span class="tg-g">{gloss.gloss}</span></>
            : picked ? <span class="note">No gloss for this word in your content pack.</span>
            : <span class="note">Tap a word of the highlighted part. Words you haven’t learned yet are underlined.</span>}
        </div>
      )}
    </div>
  );
}

/** CC BY-SA credit: reader, DCC, record URL; and where the text comes from. */
export function Attribution({ lesson }: { lesson: ListeningLesson }) {
  const a = lesson.audio;
  return (
    <p class="attribution" data-testid="attribution">
      Audio: <a href={a.record_url} target="_blank" rel="noopener">“{a.title}”</a>, read by {a.reader}, Dickinson College Commentaries,{' '}
      <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA</a> (re-encoded).
      Text: <a href={lesson.text_source.url} target="_blank" rel="noopener">{lesson.text_source.title}</a>, CC BY-SA.
    </p>
  );
}
