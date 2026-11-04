/**
 * Audītiō: listening lessons on human recordings (Dickinson College Commentaries, CC BY-SA).
 * Definitions live in content/listening/*.json (public); this module validates them and
 * builds a lesson's exercises. Pure: no DOM, no fetch.
 *
 * Flow: context line → pre-teach (new-word card + one meaning quiz per drilled word) →
 * first listen (whole recording, then the transcript with the excerpt highlighted) →
 * second listen (transcript, tap any excerpt word for its gloss) → comprehension questions.
 *
 * Questions and pre-teach quizzes are graded like any exercise and recorded as ordinary
 * `review` events with card ids `audit:<lessonId>:q<n>` / `audit:<lessonId>:w:<vocabId>`:
 * parseCardId / parseListenCard / parseSentenceCard ignore them, so they never touch words.
 */
import { externalAudioKey } from '../audio/key.ts';
import type { AudioRef } from '../audio/items.ts';
import type { ChoiceExercise } from './lesson.ts';
import { hashSeed, rng, shuffle } from './util.ts';

export interface ListeningToken {
  /** The word as printed (no punctuation). */
  w: string;
  /** Punctuation printed after the word. */
  p?: string;
  /** App lemma id of a word known by the lesson's section (gloss from the learner's lexicon). */
  lemma?: string;
  /** Enclitic attached to a known word (terramque = terra + -que). */
  enclitic?: 'que' | 'ne' | 've';
  /** Lesson vocabulary item glossing this word. */
  vocab?: string;
}
export interface ListeningLine { ref: string; text: string; excerpt?: boolean; tokens?: ListeningToken[] }
export interface ListeningVocab {
  id: string; headword: string; gloss: string; pos: string; forms: string[];
  /** Drilled words get a new-word card and a meaning quiz; the others are tap-glosses only. */
  drill: boolean; note?: string;
}
export interface ListeningQuestion { q: string; options: string[]; answer: number }
export interface ListeningAudio {
  recording: string; title: string; reader: string; record_url: string; mp3_url: string;
  /** dcc-<first 24 hex of sha256(mp3_url)>: the clip's key in the app's audio store. */
  key: string; seconds: number; license: string; attribution: string;
}
export interface ListeningLesson {
  id: string; title: string;
  /** Path section after which the lesson is placed (only if the path has it). */
  section: number;
  ref: string;
  /** One English line of context. */
  context: string;
  /** Where in the recording the excerpt is (no time offsets are known). */
  where: string;
  audio: ListeningAudio;
  text_source: { title: string; url: string; license: string };
  transcript: ListeningLine[];
  vocab: ListeningVocab[];
  notes: { form: string; gloss: string }[];
  questions: ListeningQuestion[];
}

export const AUDIT_PREFIX = 'audit:';
export const auditQuestionCard = (lesson: string, n: number): string => `${AUDIT_PREFIX}${lesson}:q${n}`;
export const auditWordCard = (lesson: string, vocab: string): string => `${AUDIT_PREFIX}${lesson}:w:${vocab}`;
export function parseAuditCard(card: string): { lesson: string; question?: number; vocab?: string } | null {
  const m = /^audit:([^:]+):(?:q(\d+)|w:([^:]+))$/.exec(card);
  if (!m) return null;
  return m[2] !== undefined ? { lesson: m[1]!, question: Number(m[2]) } : { lesson: m[1]!, vocab: m[3]! };
}

export const listeningAudio = (l: ListeningLesson): AudioRef => ({ key: l.audio.key, text: l.audio.attribution });
export const excerptLines = (l: ListeningLesson): ListeningLine[] => l.transcript.filter((x) => x.excerpt);
export const excerptTokens = (l: ListeningLesson): ListeningToken[] => excerptLines(l).flatMap((x) => x.tokens ?? []);
export const tokensText = (ts: readonly ListeningToken[]): string => ts.map((t) => t.w + (t.p ?? '')).join(' ');
/** The excerpt as one string ("Erat vir … pater."). */
export const excerptText = (l: ListeningLesson): string => excerptLines(l).map((x) => x.text).join(' ');
/** What a pre-teach card says aloud (first form, no notes): "abstinentia", "praeter". */
export const vocabSay = (v: Pick<ListeningVocab, 'headword'>): string => v.headword.split(',')[0]!.replace(/\([^)]*\)/g, '').trim();

/** Validate a lesson definition (shape and internal consistency). Throws with the reason. */
export function parseListeningLesson(raw: unknown): ListeningLesson {
  const o = raw as ListeningLesson;
  const bad = (why: string): never => { throw new Error(`listening lesson ${(o as { id?: string })?.id ?? '?'}: ${why}`); };
  if (!o || typeof o !== 'object') bad('not an object');
  if (typeof o.id !== 'string' || !/^listen-[a-z0-9-]+$/.test(o.id) || o.id.length > 64) bad('id');
  for (const k of ['title', 'ref', 'context', 'where'] as const) if (typeof o[k] !== 'string' || !o[k].trim()) bad(k);
  if (!Number.isInteger(o.section) || o.section < 1) bad('section');
  const a = o.audio;
  if (!a || typeof a.mp3_url !== 'string' || typeof a.key !== 'string') bad('audio');
  if (a.key !== externalAudioKey(a.mp3_url)) bad(`audio.key ${a.key} is not the key of ${a.mp3_url}`);
  if (!a.reader || !a.record_url || !a.attribution.includes(a.reader) || !a.attribution.includes(a.record_url) || !/CC BY-SA/.test(a.attribution)) bad('audio attribution must name the reader, the record URL and CC BY-SA');
  if (!Array.isArray(o.transcript) || !o.transcript.length) bad('transcript');
  const ids = new Set<string>();
  for (const v of o.vocab ?? []) {
    if (!v.id?.startsWith('dcc-') || ids.has(v.id)) bad(`vocab id ${v.id}`);
    if (!v.headword || !v.gloss || !Array.isArray(v.forms) || !v.forms.length) bad(`vocab ${v.id}`);
    ids.add(v.id);
  }
  const ex = o.transcript.filter((x) => x.excerpt);
  if (!ex.length) bad('no excerpt lines');
  for (const line of o.transcript) {
    if (typeof line.text !== 'string' || !line.text.trim() || typeof line.ref !== 'string') bad('transcript line');
    if (!line.excerpt) { if (line.tokens) bad('tokens on a non-excerpt line'); continue; }
    if (!line.tokens?.length) bad(`excerpt line ${line.ref} has no tokens`);
    if (tokensText(line.tokens!) !== line.text) bad(`tokens of ${line.ref} spell "${tokensText(line.tokens!)}", not "${line.text}"`);
    for (const t of line.tokens!) {
      if (!t.lemma && !t.vocab) bad(`"${t.w}" has neither a lemma nor a vocab gloss`);
      if (t.vocab) {
        const v = o.vocab.find((x) => x.id === t.vocab);
        if (!v) bad(`"${t.w}": unknown vocab ${t.vocab}`);
        else if (!v.forms.includes(t.w)) bad(`"${t.w}" is not among ${v.id}'s forms`);
      }
    }
  }
  for (const v of o.vocab) if (!excerptTokens(o).some((t) => t.vocab === v.id)) bad(`vocab ${v.id} glosses no excerpt word`);
  if (!Array.isArray(o.questions) || o.questions.length < 3 || o.questions.length > 4) bad('3–4 questions');
  for (const q of o.questions) {
    if (!q.q || !Array.isArray(q.options) || q.options.length < 2 || new Set(q.options).size !== q.options.length) bad(`question "${q.q}"`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) bad(`answer of "${q.q}"`);
  }
  return o;
}

/* ---------------- exercises ---------------- */

/** A non-graded Audītiō screen. `word`: a pre-teach card; `listen1` / `listen2`: the two listening screens. */
export interface AuditScreen {
  id: string; type: 'audit'; kind: 'context' | 'word' | 'listen1' | 'listen2';
  lesson: ListeningLesson; vocab?: ListeningVocab;
}
/** Graded Audītiō choice: an ordinary choice exercise (kind audit-word / audit-q), graded by the session like any other. */
export type AuditChoice = ChoiceExercise & { kind: 'audit-word' | 'audit-q' };

const isTrueFalse = (q: ListeningQuestion) => q.options.length === 2 && q.options[0] === 'True' && q.options[1] === 'False';

/**
 * The exercises of an Audītiō lesson. Pre-teach follows the Verba pattern (card 1, card 2, quiz 1,
 * card 3, quiz 2, …); quiz distractors are the other words' glosses of the same lesson.
 * Multiple-choice options are shuffled (seeded); True / False keep their order.
 */
export function buildAuditio(l: ListeningLesson, seed: string): (AuditScreen | AuditChoice)[] {
  const r = rng(hashSeed(`${seed}:audit`));
  let n = 0;
  const id = () => `a${++n}`;
  const out: (AuditScreen | AuditChoice)[] = [{ id: id(), type: 'audit', kind: 'context', lesson: l }];
  const drill = l.vocab.filter((v) => v.drill);
  const quiz = (v: ListeningVocab): AuditChoice => {
    const others = shuffle(l.vocab.filter((x) => x.id !== v.id && x.gloss !== v.gloss), r).slice(0, 3);
    const options = shuffle([{ id: 'a', text: v.gloss }, ...others.map((x, i) => ({ id: `d${i}`, text: x.gloss }))], r);
    return {
      id: id(), type: 'choice', kind: 'audit-word', lemma: v.id, card: auditWordCard(l.id, v.id),
      prompt: 'What does this mean?', cue: v.headword, cueLa: true, options, answer: ['a'], multi: false,
      note: `${v.headword}: ${v.gloss}.`,
    };
  };
  drill.forEach((v, i) => {
    out.push({ id: id(), type: 'audit', kind: 'word', lesson: l, vocab: v });
    if (i > 0) out.push(quiz(drill[i - 1]!));
  });
  if (drill.length) out.push(quiz(drill[drill.length - 1]!));
  out.push({ id: id(), type: 'audit', kind: 'listen1', lesson: l });
  out.push({ id: id(), type: 'audit', kind: 'listen2', lesson: l });
  const excerpt = excerptText(l);
  l.questions.forEach((q, i) => {
    const opts = q.options.map((text, k) => ({ id: `o${k}`, text }));
    out.push({
      id: id(), type: 'choice', kind: 'audit-q', lemma: '', card: auditQuestionCard(l.id, i + 1),
      prompt: q.q, cue: '', cueLa: false, options: isTrueFalse(q) ? opts : shuffle(opts, r), answer: [`o${q.answer}`], multi: false,
      note: `${l.ref}: ${excerpt}`,
    });
  });
  return out;
}
