/** Lesson runner: exercises, feedback panel, progress, quit. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AppData } from '../app/controller.ts';
import type { PathNode } from '../engine/path.ts';
import { isGraded, type ChoiceExercise, type Exercise, type TypedExercise } from '../engine/lesson.ts';
import { Session, type Outcome } from '../engine/session.ts';
import { citation, classNote } from '../engine/lexicon.ts';
import type { GlossaryTerm } from '../content/glossary.ts';
import { GrammarCardView, TermSheet } from './Glossary.tsx';
import { IconX } from './icons.tsx';
import type { LessonStats } from '../engine/events.ts';
import type { Grade } from '../engine/srs.ts';

export interface LessonResult { run: string; stats: LessonStats }

interface Props {
  app: AppData;
  node: PathNode;
  exercises: Exercise[];
  run: string;
  onReview: (card: string, grade: Grade) => void;
  onFinish: (r: LessonResult) => void;
  onQuit: () => void;
}

const MACRONS = ['ā', 'ē', 'ī', 'ō', 'ū'];

export function Lesson({ app, node, exercises, run, onReview, onFinish, onQuit }: Props) {
  const session = useMemo(() => new Session(exercises), [exercises]);
  const [, setTick] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [term, setTerm] = useState<GlossaryTerm | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contRef = useRef<HTMLButtonElement>(null);
  const item = session.current;
  const ex = item?.ex;

  useEffect(() => { if (ex?.type === 'typed') inputRef.current?.focus(); }, [ex]);
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
    setPicked([]); setTyped(''); setOutcome(null); setTick((t) => t + 1);
    if (session.done) finish();
  };

  const check = () => {
    if (!ex || !isGraded(ex) || outcome) return;
    const o = session.answer(ex.type === 'choice' ? picked : typed);
    if (o.grade && o.card) onReview(o.card, o.grade);
    setOutcome(o);
  };

  if (!ex) return null;
  const pct = Math.round(session.progress * 100);
  const canCheck = ex.type === 'intro' || ex.type === 'grammar' ||
    (ex.type === 'choice' && picked.length > 0) || (ex.type === 'typed' && typed.trim().length > 0);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !outcome && canCheck && ex.type === 'typed') { e.preventDefault(); check(); }
  };

  return (
    <div class="screen" data-screen="lesson" data-node={node.id}>
      <header class="lesson-head">
        <button type="button" class="iconbtn" aria-label="Quit lesson" onClick={onQuit} data-testid="quit"><IconX /></button>
        <div class="progress" role="progressbar" aria-label="Lesson progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <span class="lesson-tag" lang="la">{node.title}</span>
      </header>

      <main class="lesson-body" data-exercise={ex.type} data-kind={ex.kind} onKeyDown={onKey}>
        {item.retry > 0 && <span class="retry-tag">Try this one again</span>}
        {ex.type === 'grammar' && <GrammarCardView section={ex.section} onTerm={setTerm} />}
        {ex.type === 'intro' && <IntroCard app={app} lemmaId={ex.lemma} />}
        {ex.type === 'choice' && (
          <ChoiceView ex={ex} picked={picked} outcome={outcome}
            onPick={(id) => {
              if (outcome) return;
              setPicked(ex.multi ? (picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]) : [id]);
            }} />
        )}
        {ex.type === 'typed' && (
          <TypedView ex={ex} typed={typed} setTyped={setTyped} locked={!!outcome} inputRef={inputRef} />
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
            <span class="fb">{feedbackBody(ex, outcome, item.retry)}</span>
          </div>
          <button type="button" ref={contRef} class={`btn ${outcome.ok ? 'ok' : 'bad'}`} onClick={next} data-testid="continue">Continue</button>
        </footer>
      )}
      {term && <TermSheet term={term} onClose={() => setTerm(null)} />}
    </div>
  );
}

function feedbackBody(ex: Exercise, o: Outcome, retry: number): string {
  if (!isGraded(ex)) return '';
  if (o.ok && o.macronMiss) return `Spelled with macrons: ${o.expected}. ${ex.note}`;
  if (o.ok) return ex.note;
  const again = retry < 2 ? ' It will come back before this lesson ends.' : '';
  return `Correct answer: ${o.expected}. ${ex.type === 'choice' && ex.kind === 'meaning' ? '' : ex.note}${again}`.replace(/\s+/g, ' ').trim();
}

function IntroCard({ app, lemmaId }: { app: AppData; lemmaId: string }) {
  const w = app.lex.byId.get(lemmaId);
  if (!w) return null;
  const l = w.lemma;
  const [first, ...rest] = citation(l).split(', ');
  const src = w.origin === 'wheelock' ? `Wheelock ch. ${w.chapter}` : `DCC core list #${l.dcc?.rank ?? '?'}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }} data-lemma={lemmaId}>
      <span class="eyebrow">New word</span>
      <div class="wordcard">
        <div class="head">
          <span class="hw" lang="la">{first}</span>
          {rest.length > 0 && <span class="parts" lang="la">{rest.join(', ')}</span>}
          {l.gender && <span class="gchip">{l.gender}.</span>}
        </div>
        <span class="gloss">{l.gloss}</span>
        <span class="meta">{classNote(l)} · {src}</span>
      </div>
      <p class="note">{introNote(l.paradigm, l.pos)}{l.notes && w.origin === 'wheelock' ? ` ${l.notes}.`.replace('..', '.') : ''}</p>
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
    case 'n3': case 'n3n': case 'n3i': case 'n3in': return 'Genitive in -is: 3rd declension. Drop -is to find the base, and learn the gender with the word.';
    case 'irr:sum': case 'irr:possum': return 'An irregular verb: learn its forms by heart.';
    default: return pos === 'prep' ? 'A preposition: it doesn’t change form.' : 'This word doesn’t change form.';
  }
}

function ChoiceView({ ex, picked, outcome, onPick }: { ex: ChoiceExercise; picked: string[]; outcome: Outcome | null; onPick: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <h1 class="prompt">{ex.prompt}</h1>
      <div class="cue"><span class={ex.cueLa ? 'la-big' : 'en-big'} lang={ex.cueLa ? 'la' : 'en'} data-testid="cue">{ex.cue}</span></div>
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
      <h1 class="prompt">{ex.prompt}</h1>
      <div class="cue">
        <span class={ex.cueLa ? 'la-big' : 'en-big'} lang={ex.cueLa ? 'la' : 'en'} data-testid="cue">{ex.cue}</span>
        {ex.hint && <span class="hint">{ex.hint}</span>}
      </div>
      <label for={id} class="field-label">Your answer</label>
      <input id={id} ref={inputRef} class="answer-input" lang="la" autocomplete="off" autocapitalize="off" autocorrect="off"
        spellcheck={false} placeholder={ex.kind === 'recall' ? 'Latin word' : 'Latin form'} value={typed} disabled={locked}
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
