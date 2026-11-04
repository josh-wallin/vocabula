/** Lesson runner: exercises, feedback panel, progress, quit. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AppData } from '../app/controller.ts';
import type { PathNode } from '../engine/path.ts';
import { isGraded, isListening, isScored, type ChoiceExercise, type Exercise, type TypedExercise } from '../engine/lesson.ts';
import { Session, type Outcome } from '../engine/session.ts';
import { citation, classNote } from '../engine/lexicon.ts';
import { roman } from '../engine/curriculum.ts';
import type { GlossaryTerm } from '../content/glossary.ts';
import { GrammarCardView, TermSheet } from './Glossary.tsx';
import { IconFlag, IconX } from './icons.tsx';
import type { FlagBody, LessonStats } from '../engine/events.ts';
import { SentenceView } from './SentenceView.tsx';
import { FlagSheet } from './Flag.tsx';
import type { Grade } from '../engine/srs.ts';
import { exerciseAudio } from '../audio/exercise.ts';
import { introAudio, type AudioRef } from '../audio/items.ts';
import { audioMissing, loadClip, playClip, prefetchClips, stopAudio, unlockAudio } from '../audio/player.ts';
import { ListenCue, Speaker } from './Speaker.tsx';

export interface LessonResult { run: string; stats: LessonStats }

interface Props {
  app: AppData;
  node: PathNode;
  exercises: Exercise[];
  run: string;
  onReview: (card: string, grade: Grade) => void;
  onFinish: (r: LessonResult) => void;
  onQuit: () => void;
  /** Record a flag on the current exercise. */
  onFlag?: (b: FlagBody) => void;
  /** Play new words and listening clips without a tap (Profile → Autoplay audio). */
  autoplay?: boolean;
}

const MACRONS = ['ā', 'ē', 'ī', 'ō', 'ū'];

export function Lesson({ app, node, exercises, run, onReview, onFinish, onQuit, onFlag, autoplay = true }: Props) {
  const session = useMemo(() => new Session(exercises), [exercises]);
  const [, setTick] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [term, setTerm] = useState<GlossaryTerm | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagged, setFlagged] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contRef = useRef<HTMLButtonElement>(null);
  const item = session.current;
  const ex = item?.ex;

  useEffect(() => { if (ex?.type === 'typed') inputRef.current?.focus(); }, [ex]);
  // Warm the audio cache: listening clips first, then the speakers' clips. Never blocks.
  useEffect(() => {
    const listen = exercises.filter(isListening).map((e) => e.audio.key);
    const other = exercises.flatMap((e) => { const a = exerciseAudio(e, app.lex); return [a.prompt?.key, a.answer?.key]; }).filter((k): k is string => !!k);
    void prefetchClips([...listen, ...other]);
    return () => stopAudio();
  }, [exercises]);
  // A listening exercise whose clip can't be had becomes its non-audio fallback (nothing graded).
  useEffect(() => {
    if (!ex || !isListening(ex) || outcome) return;
    const cur = ex;
    const swap = () => { if (session.current?.ex === cur) { session.swapCurrent(cur.fallback); setPicked([]); setTyped(''); setTick((t) => t + 1); } };
    if (audioMissing(cur.audio.key)) { swap(); return; }
    let live = true;
    loadClip(cur.audio.key).then(() => { if (live && autoplay) void playClip(cur.audio.key); }, () => { if (live) swap(); });
    return () => { live = false; };
  }, [ex]);
  useEffect(() => { if (outcome) contRef.current?.focus(); }, [outcome]);

  const finish = () => {
    const newWords = node.newWords;
    onFinish({
      run,
      stats: {
        exercises: session.queue.length, graded: session.graded, firstTryCorrect: session.firstTryCorrect,
        newWords, reviews: session.reviews.length,
      },
    });
  };

  const next = () => {
    session.advance();
    setPicked([]); setTyped(''); setOutcome(null); setFlagOpen(false); setTick((t) => t + 1);
    if (session.done) finish();
  };

  const check = () => {
    if (!ex || !isScored(ex) || outcome) return;
    const o = session.answer(ex.type === 'typed' ? typed : picked);
    if (o.grade && o.card) onReview(o.card, o.grade);
    setOutcome(o);
  };

  if (!ex) return null;
  const pct = Math.round(session.progress * 100);
  const canCheck = ex.type === 'intro' || ex.type === 'grammar' ||
    ((ex.type === 'choice' || ex.type === 'sentence') && picked.length > 0) || (ex.type === 'typed' && typed.trim().length > 0);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !outcome && canCheck && ex.type === 'typed') { e.preventDefault(); check(); }
  };

  return (
    <div class="screen" data-screen="lesson" data-node={node.id} onPointerDown={unlockAudio}>
      <header class="lesson-head">
        <button type="button" class="iconbtn" aria-label="Quit lesson" onClick={onQuit} data-testid="quit"><IconX /></button>
        <div class="progress" role="progressbar" aria-label="Lesson progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <span class="lesson-tag" lang="la">{node.title}</span>
        {onFlag && (
          <button type="button" class={`iconbtn flagbtn${flagged === ex.id ? ' on' : ''}`} data-testid="flag"
            aria-label={flagged === ex.id ? 'Flagged' : 'Flag this exercise'} title={flagged === ex.id ? 'Flagged' : 'Flag this exercise'}
            onClick={() => setFlagOpen(true)}><IconFlag /></button>
        )}
      </header>

      <main class="lesson-body" data-exercise={ex.type} data-kind={ex.kind} onKeyDown={onKey}>
        {item.retry > 0 && <span class="retry-tag">Try this one again</span>}
        {ex.type === 'grammar' && <GrammarCardView section={ex.section} onTerm={setTerm} />}
        {ex.type === 'intro' && <IntroCard app={app} lemmaId={ex.lemma} autoplay={autoplay} />}
        {ex.type === 'choice' && (
          <ChoiceView ex={ex} picked={picked} outcome={outcome} speak={exerciseAudio(ex, app.lex).prompt}
            onPick={(id) => {
              if (outcome) return;
              setPicked(ex.multi ? (picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]) : [id]);
            }} />
        )}
        {ex.type === 'typed' && (
          <TypedView ex={ex} typed={typed} setTyped={setTyped} locked={!!outcome} inputRef={inputRef} />
        )}
        {ex.type === 'sentence' && (
          <SentenceView ex={ex} picked={picked} outcome={outcome} speak={exerciseAudio(ex, app.lex).prompt} setPicked={(p) => { if (!outcome) setPicked(p); }} />
        )}
      </main>

      {!outcome ? (
        <footer class="lesson-foot">
          <button type="button" class="btn" disabled={!canCheck} data-testid="primary"
            onClick={() => (ex.type === 'intro' || ex.type === 'grammar' ? next() : check())}>
            {ex.type === 'intro' || ex.type === 'grammar' ? 'Got it' : 'Check'}
          </button>
        </footer>
      ) : (
        <footer class={`feedback ${outcome.ok ? 'ok' : 'bad'}`} data-testid="feedback" data-ok={String(outcome.ok)}>
          <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span class="ft" lang={outcome.ok && !outcome.macronMiss ? 'la' : 'en'}>
              {outcome.ok ? (outcome.macronMiss ? 'Rēctē, but mind the macrons' : 'Rēctē!') : 'Not quite'}
            </span>
            <span class="fb-row">
              <span class="fb">{feedbackBody(ex, outcome, item.retry)}</span>
              {(() => { const a = exerciseAudio(ex, app.lex).answer; return a ? <Speaker key={a.key} audio={a} label="Listen to the answer" /> : null; })()}
            </span>
          </div>
          <button type="button" ref={contRef} class={`btn ${outcome.ok ? 'ok' : 'bad'}`} onClick={next} data-testid="continue">Continue</button>
        </footer>
      )}
      {term && <TermSheet term={term} onClose={() => setTerm(null)} />}
      {flagOpen && onFlag && (
        <FlagSheet ex={ex} node={node.id} onClose={() => setFlagOpen(false)}
          onSend={(b) => { onFlag(b); setFlagged(ex.id); setFlagOpen(false); }} />
      )}
    </div>
  );
}

function feedbackBody(ex: Exercise, o: Outcome, retry: number): string {
  if (ex.type === 'sentence') {
    const again = !o.ok && retry < 2 ? ' It will come back before this lesson ends.' : '';
    const exp = /[.!?]$/.test(o.expected) ? o.expected : `${o.expected}.`;
    return (o.ok ? ex.note : `Correct answer: ${exp} ${ex.note}${again}`).replace(/\s+/g, ' ').trim();
  }
  if (!isGraded(ex)) return '';
  if (o.ok && o.macronMiss) return `Spelled with macrons: ${o.expected}. ${ex.note}`;
  if (o.ok) return ex.note;
  const again = retry < 2 ? ' It will come back before this lesson ends.' : '';
  return `Correct answer: ${o.expected}. ${ex.type === 'choice' && ex.kind === 'meaning' ? '' : ex.note}${again}`.replace(/\s+/g, ' ').trim();
}

function IntroCard({ app, lemmaId, autoplay }: { app: AppData; lemmaId: string; autoplay: boolean }) {
  const w = app.lex.byId.get(lemmaId);
  if (!w) return null;
  const l = w.lemma;
  const [first, ...rest] = citation(l).split(', ');
  const main = w.origin === 'wheelock' ? `Wheelock ch. ${w.chapter}` : w.origin === 'dcc' ? `DCC core list #${l.dcc?.rank ?? '?'}` : '';
  const fr = w.fr ? `Familia Rōmāna cap. ${roman(w.fr.chapter)}` : '';
  const src = [main, fr].filter(Boolean).join(' · ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }} data-lemma={lemmaId}>
      <span class="eyebrow">New word</span>
      <div class="wordcard">
        <div class="head">
          <span class="hw" lang="la">{first}</span>
          <Speaker key={l.id} audio={introAudio(l)} autoplay={autoplay} label={`Listen: ${citation(l)}`} />
          {rest.length > 0 && <span class="parts" lang="la">{rest.join(', ')}</span>}
          {l.gender && <span class="gchip">{l.gender}.</span>}
        </div>
        <span class="gloss">{l.gloss}</span>
        <span class="meta">{classNote(l)} · {src}</span>
      </div>
      <p class="note">{w.origin === 'fr'
        ? 'A preview from Familia Rōmāna: learn what it means now. Its forms come once the grammar is on the path.'
        : `${introNote(l.paradigm, l.pos)}${l.notes && w.origin === 'wheelock' ? ` ${l.notes}.`.replace('..', '.') : ''}`}</p>
    </div>
  );
}

function introNote(paradigm: string, pos: string): string {
  switch (paradigm) {
    case 'v1': return 'The infinitive ends in -āre: 1st conjugation.';
    case 'v2': return 'The infinitive ends in -ēre: 2nd conjugation.';
    case 'n1': return 'The second form is the genitive. Its ending, -ae, marks the noun as 1st declension.';
    case 'n2m': return 'Genitive in -ī: 2nd declension.';
    case 'n2n': return 'Genitive in -ī and nominative in -um: a 2nd-declension neuter.';
    case 'adj12': return 'An adjective lists its masculine, feminine and neuter forms.';
    case 'v3': return 'The infinitive ends in short -ere: 3rd conjugation.';
    case 'v3io': return 'Infinitive in short -ere, but 1st person in -iō: 3rd conjugation -iō verb.';
    case 'v4': return 'The infinitive ends in -īre: 4th conjugation.';
    case 'adj:ius': return 'Listed like bonus, but one of the nine adjectives with genitive singular -īus and dative singular -ī in every gender.';
    case 'pron:hic': case 'pron:ille': return 'A demonstrative: it points things out, as an adjective (this book) or on its own as a pronoun (this man).';
    case 'n3': case 'n3n': case 'n3i': case 'n3in': return 'Genitive in -is: 3rd declension. Drop -is to find the base, and learn the gender with the word.';
    case 'irr:sum': case 'irr:possum': return 'An irregular verb: learn its forms by heart.';
    default: return pos === 'prep' ? 'A preposition: it doesn’t change form.' : 'This word doesn’t change form.';
  }
}

function ChoiceView({ ex, picked, outcome, onPick, speak }: { ex: ChoiceExercise; picked: string[]; outcome: Outcome | null; onPick: (id: string) => void; speak: AudioRef | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {ex.audio && <span class="eyebrow" lang="la">Audī</span>}
      <h1 class="prompt">{ex.prompt}</h1>
      {ex.audio && !outcome
        ? <ListenCue audio={ex.audio} />
        : (
          <div class="cue"><span class="with-speaker">
            <span class={ex.cueLa ? 'la-big' : 'en-big'} lang={ex.cueLa ? 'la' : 'en'} data-testid="cue">{ex.cue}</span>
            {speak && !outcome && <Speaker key={speak.key} audio={speak} />}
          </span></div>
        )}
      {ex.multi && <span class="select-all">Select all that fit</span>}
      <div class="options" role={ex.multi ? 'group' : 'radiogroup'} aria-label="Answers">
        {ex.options.map((o) => {
          const isAns = ex.answer.includes(o.id);
          const sel = picked.includes(o.id);
          let cls = 'opt';
          if (outcome) {
            if (isAns && sel) cls += ' right';
            else if (isAns) cls += ' right missed';
            else if (sel) cls += ' wrong';
          }
          return (
            <button key={o.id} type="button" class={cls} aria-pressed={!outcome && sel ? 'true' : 'false'}
              data-option={o.id} data-answer={isAns ? '1' : '0'} disabled={!!outcome} onClick={() => onPick(o.id)}>
              {o.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TypedView({ ex, typed, setTyped, locked, inputRef }: {
  ex: TypedExercise; typed: string; setTyped: (s: string) => void; locked: boolean; inputRef: { current: HTMLInputElement | null };
}) {
  const insert = (ch: string) => {
    const el = inputRef.current;
    if (!el) { setTyped(typed + ch); return; }
    const s = el.selectionStart ?? typed.length;
    const e = el.selectionEnd ?? typed.length;
    const v = typed.slice(0, s) + ch + typed.slice(e);
    setTyped(v);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + ch.length, s + ch.length); });
  };
  const id = `answer-${ex.id}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {ex.audio && <span class="eyebrow" lang="la">Audī</span>}
      <h1 class="prompt">{ex.prompt}</h1>
      {ex.audio
        ? (locked ? <div class="cue"><span class="la-big" lang="la" data-testid="cue">{ex.cue}</span></div> : <ListenCue audio={ex.audio} />)
        : (
          <div class="cue">
            <span class={ex.cueLa ? 'la-big' : 'en-big'} lang={ex.cueLa ? 'la' : 'en'} data-testid="cue">{ex.cue}</span>
            {ex.hint && <span class="hint">{ex.hint}</span>}
          </div>
        )}
      <label for={id} class="field-label">Your answer</label>
      <input id={id} ref={inputRef} class="answer-input" lang="la" autocomplete="off" autocapitalize="off" autocorrect="off"
        spellcheck={false} placeholder={ex.kind === 'recall' ? 'Latin word' : ex.kind === 'dictate' ? 'What you hear' : 'Latin form'} value={typed} disabled={locked}
        data-testid="answer" onInput={(e) => setTyped((e.target as HTMLInputElement).value)} />
      <div class="macrons">
        <span class="lbl">Macrons</span>
        {MACRONS.map((m) => (
          <button key={m} type="button" aria-label={`Insert ${m}`} disabled={locked} lang="la"
            onMouseDown={(e) => e.preventDefault()} onClick={() => insert(m)}>{m}</button>
        ))}
      </div>
      <p class="note">Macrons are optional for now: a missing one still counts, with a reminder.</p>
    </div>
  );
}

