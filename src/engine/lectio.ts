/**
 * Lectiō: short original reading passages (content/lectio/sNN.json, public), one or two per
 * section, written only with Wheelock words taught by that section and endings it has unlocked.
 * This module validates them, glosses and parses their words, and builds a lesson. Pure: no DOM.
 *
 * Flow: title + one English line of context → the passage, one sentence per screen (earlier
 * sentences stay above; speaker, tap any word for its gloss and parse, "show translation") →
 * 3–4 comprehension questions, graded like any exercise and recorded as ordinary `review`
 * events with card ids `lectio:<id>:q<n>` (parseCardId / parseListenCard / parseSentenceCard
 * ignore them, so they never touch word or sentence cards).
 *
 * Tokens use the sentence bank's schema (form, lemma, cell, attach, comma). A proper name not on
 * the Wheelock list (Mārcus, Graecia) is `proper: true` with its own `gloss`; its lemma is "proper".
 * Glosses of every other word come from the learner's own lexicon at run time, so no textbook
 * text is in the files.
 */
import type { CellId, Lemma } from '../morph/types.ts';
import { generate } from '../morph/generate.ts';
import { nfc } from '../morph/phonology.ts';
import { tenseOf } from '../morph/cells.ts';
import { featureOfCell, featuresAt, hasFeature, type FeatureId } from './curriculum.ts';
import { citation, type Lexicon } from './lexicon.ts';
import { tokenText, type Token } from './sentences.ts';
import type { ChoiceExercise } from './lesson.ts';
import { hashSeed, rng, shuffle } from './util.ts';

export interface LectioToken extends Token {
  /** A proper name (not a Wheelock word): lemma is "proper", glossed here. */
  proper?: true;
  gloss?: string;
}
export interface LectioSentence {
  tokens: LectioToken[];
  /** The English translation shown on "Show translation". */
  en: string;
  punct?: '.' | '?' | '!';
  /** Who says it, in a dialogue (a Latin name, shown before the sentence; not spoken). */
  speaker?: string;
}
export interface LectioQuestion { q: string; options: string[]; answer: number }
/** A note on one word: sentence index `s`, token index `t` (both 0-based). */
export interface LectioNote { s: number; t: number; note: string }
export interface Lectio {
  id: string;
  /** The section the passage is written for (only its words and endings), and placed in. */
  section: number;
  title: string;
  titleEn: string;
  /** One English line of context. */
  context: string;
  sentences: LectioSentence[];
  questions: LectioQuestion[];
  notes?: LectioNote[];
}

export const PROPER = 'proper';
export const LECTIO_PREFIX = 'lectio:';
export const MIN_SENTENCES = 5;
export const MAX_SENTENCES = 10;
export const MIN_WORDS = 3;
export const MAX_WORDS = 9;

export const lectioQuestionCard = (id: string, n: number): string => `${LECTIO_PREFIX}${id}:q${n}`;
export function parseLectioCard(card: string): { id: string; question: number } | null {
  const m = /^lectio:([^:]+):q(\d+)$/.exec(card);
  return m ? { id: m[1]!, question: Number(m[2]) } : null;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A word as printed in the passage (with its enclitic and any comma). */
export function lectioWord(s: LectioSentence, i: number): string {
  const t = s.tokens[i]!;
  const w = tokenText(t);
  return (i === 0 ? cap(w) : w) + (t.comma && i < s.tokens.length - 1 ? ',' : '');
}
/** The printed sentence (also its audio text): "Mārce, saepe errās!" */
export function lectioText(s: LectioSentence): string {
  return s.tokens.map((_, i) => lectioWord(s, i)).join(' ') + (s.punct ?? '.');
}

/** Validate one file (an array of passages). Throws with the passage id and reason. */
export function parseLectioFile(raw: unknown): Lectio[] {
  if (!Array.isArray(raw)) throw new Error('lectio file: not an array');
  return raw.map(parseLectio);
}

export function parseLectio(raw: unknown): Lectio {
  const o = raw as Lectio;
  const bad = (why: string): never => { throw new Error(`lectio ${(o as { id?: string })?.id ?? '?'}: ${why}`); };
  if (!o || typeof o !== 'object') bad('not an object');
  if (typeof o.id !== 'string' || !/^l\d\d-\d+$/.test(o.id)) bad('id (lNN-k)');
  if (!Number.isInteger(o.section) || o.section < 1 || Number(o.id.slice(1, 3)) !== o.section) bad('section (must match the id)');
  for (const k of ['title', 'titleEn', 'context'] as const) if (typeof o[k] !== 'string' || !o[k].trim()) bad(k);
  if (!Array.isArray(o.sentences) || o.sentences.length < MIN_SENTENCES || o.sentences.length > MAX_SENTENCES) bad(`${MIN_SENTENCES}–${MAX_SENTENCES} sentences`);
  o.sentences.forEach((s, i) => {
    const where = `sentence ${i + 1}`;
    if (!Array.isArray(s.tokens) || s.tokens.length < MIN_WORDS || s.tokens.length > MAX_WORDS) bad(`${where}: ${MIN_WORDS}–${MAX_WORDS} words`);
    s.tokens.forEach((t, j) => {
      if (typeof t.form !== 'string' || !t.form || typeof t.lemma !== 'string' || !t.lemma || typeof t.cell !== 'string' || !t.cell) bad(`${where} token ${j}`);
      if (t.attach !== undefined && t.attach !== 'que' && t.attach !== 'ne') bad(`${where} token ${j} attach`);
      if (t.proper && (t.lemma !== PROPER || typeof t.gloss !== 'string' || !t.gloss.trim())) bad(`${where} "${t.form}": a proper name needs lemma "proper" and a gloss`);
      if (!t.proper && t.lemma === PROPER) bad(`${where} "${t.form}": lemma "proper" without proper: true`);
    });
    if (typeof s.en !== 'string' || !s.en.trim()) bad(`${where}: en`);
    if (s.punct !== undefined && !['.', '?', '!'].includes(s.punct)) bad(`${where}: punct`);
    if (s.speaker !== undefined && (typeof s.speaker !== 'string' || !s.speaker.trim() || s.speaker.length > 24)) bad(`${where}: speaker`);
  });
  if (!Array.isArray(o.questions) || o.questions.length < 3 || o.questions.length > 4) bad('3–4 questions');
  for (const q of o.questions) {
    if (!q.q || !Array.isArray(q.options) || q.options.length < 2 || new Set(q.options).size !== q.options.length) bad(`question "${q.q}"`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) bad(`answer of "${q.q}"`);
  }
  for (const n of o.notes ?? []) {
    if (!o.sentences[n.s]?.tokens[n.t] || typeof n.note !== 'string' || !n.note.trim()) bad(`note ${n.s}.${n.t}`);
  }
  return {
    ...o,
    sentences: o.sentences.map((s) => ({ ...s, tokens: s.tokens.map((t) => ({ ...t, form: nfc(t.form) })) })),
  };
}

/* ---------------- glosses and parses ---------------- */

const CASE_ABBR: Record<string, string> = { nom: 'nom.', gen: 'gen.', dat: 'dat.', acc: 'acc.', abl: 'abl.', voc: 'voc.' };
const ORD: Record<string, string> = { '1': '1st', '2': '2nd', '3': '3rd' };
const TENSE: Record<string, string> = { pres: 'present', fut: 'future', impf: 'imperfect' };

/** One cell, short: "gen. sg.", "abl. pl. f.", "3rd pl. future", "infinitive", "imperative sg.". */
export function shortCell(cell: CellId): string {
  if (cell === 'citation') return '';
  if (cell === 'pres.act.inf') return 'infinitive';
  if (cell.startsWith('pres.act.imp.')) return `imperative ${cell.endsWith('2sg') ? 'sg.' : 'pl.'}`;
  const t = tenseOf(cell);
  if (t) { const p = cell.slice(-3); return `${ORD[p[0]!]} ${p.slice(1)}. ${TENSE[t]}`; }
  const [c, n, g] = cell.split('.');
  return [CASE_ABBR[c!], `${n}.`, g ? `${g}.` : ''].filter(Boolean).join(' ');
}

/**
 * Several cells of one form, compact: cases sharing number (and gender) are joined
 * ("gen./dat. sg. or nom. pl."); verb cells are listed ("3rd sg. present").
 */
export function compactCells(cells: readonly CellId[]): string {
  const groups = new Map<string, string[]>();
  const verbs: string[] = [];
  for (const c of cells) {
    if (c === 'citation') continue;
    const [k, ...rest] = c.split('.');
    if (CASE_ABBR[k!] && !tenseOf(c)) {
      const key = rest.join('.');
      const g = groups.get(key) ?? [];
      g.push(CASE_ABBR[k!]!);
      groups.set(key, g);
    } else verbs.push(shortCell(c));
  }
  const nominal = [...groups.entries()].map(([key, cs]) => `${cs.join('/')} ${key.split('.').map((x) => `${x}.`).join(' ')}`);
  return [...nominal, ...verbs].join(' or ');
}

/**
 * The cells of `lemma` that produce `form` and are unlocked. A vocabulary vocative that is
 * the same as the nominative is left out (puellae: gen./dat. sg. or nom. pl.), unless the
 * word is used as a vocative here.
 */
export function formCells(lemma: Lemma, form: string, unlocked: ReadonlySet<FeatureId>, here?: CellId): CellId[] {
  const f = nfc(form).toLowerCase();
  const all = (Object.entries(generate(lemma)) as [CellId, string | undefined][])
    .filter(([c, v]) => v !== undefined && nfc(v).toLowerCase() === f)
    .map(([c]) => c)
    .filter((c) => {
      if (lemma.paradigm === 'indecl') return true;
      const ft = featureOfCell(lemma, c);
      return c === here || (ft !== null && hasFeature(unlocked, ft));
    });
  const set = new Set(all);
  return all.filter((c) => !(c.startsWith('voc.') && c !== here && set.has(`nom.${c.slice(4)}` as CellId)));
}

export interface WordInfo {
  /** The word as tapped ("puellaeque"). */
  word: string;
  /** Dictionary form: "puella, puellae f." / "Mārcus" (a name). */
  head: string;
  gloss: string;
  /** Every unlocked reading of the form ("gen./dat. sg. or nom. pl."), '' for indeclinables. */
  parse: string;
  /** The reading in this sentence ("gen. sg."), when the form has more than one. */
  here: string;
  note?: string;
  /** Not in the learner's pack (no gloss available). */
  missing?: boolean;
}

const ENCLITIC: Record<string, string> = { que: '-que: and', ne: '-ne: asks a yes/no question' };

/** Gloss and parse for token `t` of sentence `s` ("puellae — girl; gen./dat. sg. or nom. pl."). */
export function wordInfo(lex: Pick<Lexicon, 'byId'>, p: Lectio, s: number, t: number): WordInfo {
  const sent = p.sentences[s]!;
  const tok = sent.tokens[t]!;
  const word = tokenText(tok);
  const note = p.notes?.find((n) => n.s === s && n.t === t)?.note;
  const extra = tok.attach ? ` · ${ENCLITIC[tok.attach]}` : '';
  if (tok.proper) {
    return { word, head: 'proper name', gloss: `${tok.gloss}${extra}`, parse: shortCell(tok.cell), here: '', ...(note ? { note } : {}) };
  }
  const w = lex.byId.get(tok.lemma);
  if (!w) return { word, head: tok.form, gloss: '', parse: shortCell(tok.cell), here: '', missing: true, ...(note ? { note } : {}) };
  const l = w.lemma;
  const cells = formCells(l, tok.form, featuresAt(p.section, true), tok.cell);
  const parse = compactCells(cells);
  const here = cells.length > 1 ? shortCell(tok.cell) : '';
  return { word, head: `${citation(l)}${l.gender ? ` ${l.gender}.` : ''}`, gloss: `${l.gloss}${extra}`, parse, here, ...(note ? { note } : {}) };
}

/** "puellae — girl; gen./dat. sg. or nom. pl. (here gen. sg.)" */
export function wordInfoLine(i: WordInfo): string {
  const parse = i.parse ? `; ${i.parse}${i.here ? ` (here ${i.here})` : ''}` : '';
  return `${i.word} — ${i.gloss || 'no gloss in your pack'}${parse}`;
}

/* ---------------- checks against the curriculum ---------------- */

/**
 * Why a token can't appear in a passage for `section`, or null: the same rules as the sentence
 * bank (a Wheelock word first taught by then, the form generated for lemma + cell, the ending's
 * feature unlocked by the end of the section, an enclitic taught by then). Proper names pass.
 */
export function tokenProblem(t: LectioToken, byId: ReadonlyMap<string, Lemma>, section: number): string | null {
  if (t.proper) return null;
  const chapter = (l: Lemma) => Math.min(...l.sources.map((x) => x.chapter));
  const l = byId.get(t.lemma);
  if (!l) return `${t.lemma} is not a Wheelock word`;
  if (chapter(l) > section) return `${t.lemma} is taught in ch. ${chapter(l)}`;
  if (generate(l)[t.cell] !== t.form) return `${t.lemma} ${t.cell} is ${generate(l)[t.cell] ?? 'not generated'}, not ${t.form}`;
  if (l.paradigm !== 'indecl') {
    const f = featureOfCell(l, t.cell);
    if (f === null || !hasFeature(featuresAt(section, true), f)) return `${t.cell} (${f}) is locked in section ${section}`;
  }
  if (t.attach) {
    const e = byId.get(`${t.attach}-enclitic`);
    if (!e || chapter(e) > section) return `-${t.attach} is not taught by section ${section}`;
  }
  return null;
}

/* ---------------- exercises ---------------- */

/** A non-graded Lectiō screen: the context card, or sentence `index` of the passage. */
export interface LectioScreen { id: string; type: 'lectio'; kind: 'context' | 'read'; passage: Lectio; index: number }
export type LectioChoice = ChoiceExercise & { kind: 'lectio-q' };

const isTrueFalse = (q: LectioQuestion) => q.options.length === 2 && q.options[0] === 'True' && q.options[1] === 'False';

/** The exercises of a Lectiō lesson: context, one screen per sentence, then the questions (options shuffled, seeded). */
export function buildLectio(p: Lectio, seed: string): (LectioScreen | LectioChoice)[] {
  const r = rng(hashSeed(`${seed}:lectio`));
  let n = 0;
  const id = () => `l${++n}`;
  const out: (LectioScreen | LectioChoice)[] = [{ id: id(), type: 'lectio', kind: 'context', passage: p, index: 0 }];
  p.sentences.forEach((_, i) => out.push({ id: id(), type: 'lectio', kind: 'read', passage: p, index: i }));
  p.questions.forEach((q, i) => {
    const opts = q.options.map((text, k) => ({ id: `o${k}`, text }));
    out.push({
      id: id(), type: 'choice', kind: 'lectio-q', lemma: '', card: lectioQuestionCard(p.id, i + 1),
      prompt: q.q, cue: '', cueLa: false, options: isTrueFalse(q) ? opts : shuffle(opts, r), answer: [`o${q.answer}`], multi: false,
      note: `${p.title}: ${p.titleEn}.`,
    });
  });
  return out;
}
