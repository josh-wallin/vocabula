/**
 * Historia tab: famous sayings in real Latin (Suetonius), each with tap-to-gloss words,
 * an eSpeak reading, an original translation, a sourced essay and graded questions.
 * Reuses the Audītiō transcript / gloss styling (.transcript, .tok, .tgloss) and Speaker.
 */
import { Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { AppData } from '../app/controller.ts';
import { historiaEntries } from '../content/historia.ts';
import {
  curlyPost, curlyPre, gradeHistoria, headIndex, historiaQuestionCard, historiaSpeech, historiaWordSpeech, knownShare, learnerKnownIds, optionOrder,
  tokenKnown, type HeadIndex, type HistoriaEntry, type HistoriaToken,
} from '../engine/historia.ts';
import type { Grade } from '../engine/srs.ts';
import { formAudio } from '../audio/items.ts';
import { Speaker } from './Speaker.tsx';
import './historia.css';

/** Tab icon: a scroll. */
export const IconScroll = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={2}
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M7 4h11a2 2 0 0 1 2 2v1h-4" /><path d="M16 7v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10" /><path d="M7 4a2 2 0 0 0-2 2v11" /><path d="M9 9h4M9 13h4" />
  </svg>
);

export function HistoriaList({ app, onOpen }: { app: AppData; onOpen: (id: string) => void }) {
  const known = useMemo(() => learnerKnownIds(app.path, app.state), [app.state]);
  const heads = useMemo(() => headIndex(app.lex), [app.lex]);
  return (
    <main class="page" data-screen="historia">
      <h1 lang="la">Historia</h1>
      <p>Famous sayings in the Latin of Suetonius, with the story around them and what we can and can’t know about them.</p>
      <ul class="hist-list">
        {historiaEntries().map((e) => {
          const k = knownShare(e, known, heads);
          return (
            <li key={e.id}>
              <button type="button" class="hist-card" data-testid="historia-entry" data-id={e.id} onClick={() => onOpen(e.id)}>
                <span class="hist-saying" lang="la">{e.saying}</span>
                <span class="hist-title">{e.title}</span>
                <span class="hist-cite">{e.author}, <i lang="la">{e.work}</i> · {e.citation}</span>
                <span class="hist-meter" data-testid="known-meter" data-pct={k.pct}>
                  <span class="bar" aria-hidden="true"><span style={{ width: `${k.pct}%` }} /></span>
                  <span>Known words: {k.pct}%</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p class="note">“Known words” counts the words of each passage that you have met on the path.</p>
    </main>
  );
}

export function HistoriaEntryView({ app, id, onReview }: { app: AppData; id: string; onReview: (card: string, grade: Grade) => void }) {
  const e = historiaEntries().find((x) => x.id === id);
  const known = useMemo(() => learnerKnownIds(app.path, app.state), [app.state]);
  const heads = useMemo(() => headIndex(app.lex), [app.lex]);
  const [showEn, setShowEn] = useState(false);
  if (!e) return <main class="page"><p>This entry doesn’t exist.</p></main>;
  const k = knownShare(e, known, heads);
  return (
    <main class="page hist" data-screen="historia-entry" data-id={e.id}>
      <span class="eyebrow">{e.author} · {e.citation}</span>
      <h1>{e.title}</h1>
      <p class="hist-setting">{e.setting}</p>

      <section class="hist-latin">
        <div class="hist-latin-head">
          <h2 lang="la">Textus</h2>
          <Speaker audio={formAudio(historiaSpeech(e))} label="Listen to the passage (eSpeak)" />
        </div>
        <Passage entry={e} known={known} heads={heads} />
        <p class="note">Known words: {k.known} of {k.total} ({k.pct}%), marked with a solid underline. {e.excerpt_note}</p>
        <button type="button" class="btn secondary" aria-expanded={showEn} data-testid="toggle-translation" onClick={() => setShowEn(!showEn)}>
          {showEn ? 'Hide the translation' : 'Show the translation'}
        </button>
        {showEn && (
          <div class="hist-en" data-testid="translation">
            <p>{e.translation}</p>
            <p class="note">{e.translation_note}</p>
          </div>
        )}
      </section>

      <section class="hist-essay" data-testid="essay">
        <h2>The story</h2>
        {e.essay.map((para, i) => (
          <p key={i}>
            {para.map((c, j) => (
              <Fragment key={j}>
                <span class={c.doubt ? 'claim doubt' : 'claim'} title={c.doubt ? 'Uncertain or interpretive' : undefined}>{c.t}</span>
                {c.src.map((n) => <a key={n} class="ref" href={`#hist-src-${e.id}-${n}`} aria-label={`Source ${n}`}>[{n}]</a>)}
                {c.doubt && <span class="doubt-mark" aria-label="uncertain">?</span>}{' '}
              </Fragment>
            ))}
          </p>
        ))}
        <p class="note">Sentences marked <span class="doubt-mark">?</span> are uncertain, disputed or my interpretation; numbers point to the sources below.</p>
      </section>

      <Questions entry={e} app={app} onReview={onReview} />

      <section class="hist-sources" data-testid="sources">
        <h2>Sources</h2>
        <ol>
          {e.sources.map((s, i) => (
            <li key={i} id={`hist-src-${e.id}-${i + 1}`}><a href={s.url} target="_blank" rel="noopener">{s.label}</a></li>
          ))}
        </ol>
        <p class="note">
          Latin: {e.edition.name}; {e.edition.section}. Quoted verbatim (quotation marks normalized). {e.macrons.note}
        </p>
        {e.macrons.uncertain.length > 0 && (
          <details class="hist-macrons">
            <summary>Notes on vowel lengths</summary>
            <ul>{e.macrons.uncertain.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </details>
        )}
        <p class="note">Translation, glosses, essay and questions are original to Vocābula. Links checked {e.verified}.</p>
      </section>
    </main>
  );
}

function Passage({ entry, known, heads }: { entry: HistoriaEntry; known: ReadonlySet<string>; heads: HeadIndex }) {
  const [sel, setSel] = useState<number | null>(null);
  const t: HistoriaToken | undefined = sel === null ? undefined : entry.tokens[sel];
  return (
    <div class="transcript-wrap">
      <div class="transcript hist-text" lang="la" data-testid="passage">
        {entry.tokens.map((tok, i) => {
          const kn = tokenKnown(tok, known, heads);
          const joined = (tok.p ?? '').endsWith('·');
          return (
            <Fragment key={i}>
              <span class="hist-w">{curlyPre(tok.pre)}
              <button type="button" class={`tok${kn ? ' known' : ''}${sel === i ? ' on' : ''}`} data-testid="tok" data-known={kn ? '1' : '0'}
                aria-pressed={sel === i ? 'true' : 'false'} onClick={() => setSel(sel === i ? null : i)}>{tok.w}</button>
              {curlyPost(tok.p)}</span>{joined ? '' : ' '}
            </Fragment>
          );
        })}
      </div>
      <div class="tgloss" role="status" aria-live="polite" data-testid="gloss">
        {t
          ? (
            <>
              <span class="tg-w" lang="la">{t.w}</span>
              <Speaker key={t.w} audio={formAudio(historiaWordSpeech(t))} label={`Listen: ${t.w}`} />
              <span class="tg-h" lang="la">{t.lemma}</span>
              <span class="tg-g">{t.gloss}</span>
              <span class="tg-p">{t.parse}{tokenKnown(t, known, heads) ? ' · you know this word' : ''}</span>
            </>
          )
          : <span class="note">Tap any word for its meaning and grammar.</span>}
      </div>
    </div>
  );
}

function Questions({ entry, app, onReview }: { entry: HistoriaEntry; app: AppData; onReview: (card: string, grade: Grade) => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  return (
    <section class="hist-questions" data-testid="questions">
      <h2>Questions</h2>
      {entry.questions.map((q, qi) => {
        const n = qi + 1;
        const card = historiaQuestionCard(entry.id, n);
        const chosen = answers[n];
        const last = app.state.last.get(card);
        return (
          <div key={card} class="hist-q" data-testid="question" data-card={card}>
            <p class="hist-q-text">{n}. {q.q}</p>
            <div class="options" role="radiogroup" aria-label={`Question ${n}`}>
              {optionOrder(entry, n).map((oi) => {
                const cls = chosen === undefined ? '' : oi === q.answer ? ' right' : oi === chosen ? ' wrong' : '';
                return (
                  <button key={oi} type="button" role="radio" aria-checked={chosen === oi ? 'true' : 'false'} class={`opt${cls}`}
                    disabled={chosen !== undefined} data-testid="hist-opt" data-correct={oi === q.answer ? '1' : '0'}
                    onClick={() => {
                      setAnswers({ ...answers, [n]: oi });
                      onReview(card, gradeHistoria(entry, n, oi));
                    }}>{q.options[oi]}</button>
                );
              })}
            </div>
            {chosen !== undefined
              ? <p class={`hist-verdict ${chosen === q.answer ? 'ok' : 'bad'}`} role="status" data-testid="verdict">{chosen === q.answer ? 'Right.' : `Not quite: ${q.options[q.answer]}`}</p>
              : last && <p class="note">Last time: {last.grade === 'good' ? 'right' : 'missed'}.</p>}
          </div>
        );
      })}
    </section>
  );
}
