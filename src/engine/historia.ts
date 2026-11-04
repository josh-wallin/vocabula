/**
 * Historia: short passages of real Latin (Suetonius, the Historia Augusta) containing a famous saying, with
 * word-by-word glosses, an original translation, a sourced essay and a few questions.
 * Definitions live in content/historia/*.json (public: the Latin is public domain; the
 * glosses, translations, essays and questions are original). Pure: no DOM, no fetch.
 *
 * Tracing: `source_text` is the edition's Latin verbatim (quotation marks as ASCII);
 * the tokens, with macrons stripped and their punctuation, must spell it exactly. The
 * macrons are editorial (added by the app). Every essay claim cites ≥ 1 entry of `sources`
 * (1-based) and may be marked `doubt` (uncertain or interpretive).
 *
 * Questions are graded on the first answer and recorded as ordinary `review` events with
 * card ids `historia:<entryId>:q<n>`: parseCardId / parseListenCard / parseSentenceCard /
 * parseAuditCard ignore them, so they never touch word cards.
 */
import { stripMacrons } from '../morph/phonology.ts';
import type { Grade } from './srs.ts';
import type { Path } from './path.ts';
import type { DerivedState } from './events.ts';
import type { Lexicon } from './lexicon.ts';

export interface HistoriaToken {
  /** The word with editorial macrons, as displayed (no punctuation). */
  w: string;
  /** Punctuation printed before the word (an opening quotation mark). */
  pre?: string;
  /** Punctuation printed after the word; a trailing "·" joins the next word without a space. */
  p?: string;
  /** Dictionary headword (citation form), e.g. "urbs, urbis, f.". */
  lemma: string;
  /** Grammatical analysis of this form. */
  parse: string;
  /** English meaning in this context. */
  gloss: string;
  /** App lexicon ids of the word (Wheelock / DCC), when the app teaches it: used for "known words". */
  app?: string[];
  /** Enclitic written onto the word (capillōque = capillō + -que). */
  enclitic?: 'que';
  /** A verse line ends after this word (verse entries): a line break, not a space. */
  br?: true;
  /** A homograph of a different app word (cum "when" vs cum "with"): never matched by headword. */
  nolink?: true;
}
export interface HistoriaClaim { t: string; src: number[]; doubt?: boolean }
export interface HistoriaQuestion { q: string; options: string[]; answer: number }
export interface HistoriaSource { label: string; url: string; kind: 'ancient' | 'modern' }
export interface HistoriaEntry {
  id: string;
  order: number;
  title: string;
  /** The famous words, macronized. */
  saying: string;
  author: string;
  work: string;
  /** Standard citation, e.g. "Suet. Aug. 28.3". */
  citation: string;
  setting: string;
  /** The passage is (mostly) verse: lines end at tokens with `br`. */
  verse?: true;
  edition: { name: string; url: string; section: string };
  /** The edition's text, verbatim (ASCII quotation marks). */
  source_text: string;
  excerpt_note: string;
  macrons: { editorial: true; note: string; uncertain: string[] };
  tokens: HistoriaToken[];
  translation: string;
  translation_note: string;
  essay: HistoriaClaim[][];
  questions: HistoriaQuestion[];
  sources: HistoriaSource[];
  /** Date the citations and URLs were last checked (YYYY-MM-DD). */
  verified: string;
}

export const HISTORIA_PREFIX = 'historia:';
export const historiaQuestionCard = (entry: string, n: number): string => `${HISTORIA_PREFIX}${entry}:q${n}`;
export function parseHistoriaCard(card: string): { entry: string; question: number } | null {
  const m = /^historia:([a-z0-9-]+):q(\d+)$/.exec(card);
  return m ? { entry: m[1]!, question: Number(m[2]) } : null;
}
/** The node id carried in a Historia review's body (there is no path node). */
export const historiaNode = (entry: string): string => `historia:${entry}`;

/** The edition's text rebuilt from the tokens (macrons stripped): must equal `source_text`. */
export function tokensSourceText(ts: readonly HistoriaToken[]): string {
  return ts.map((t, i) => (t.pre ?? '') + stripMacrons(t.w) + (t.p ?? '') + (i < ts.length - 1 ? sep(t) : '')).join('');
}

/** What follows a token: a line break (end of a verse line), nothing (after an inscription dot) or a space. */
const sep = (t: Pick<HistoriaToken, 'p' | 'br'>): string => (t.br ? '\n' : (t.p ?? '').endsWith('·') ? '' : ' ');

/** Typographic quotes for display: an opening " becomes “, a closing one ”. */
export const curlyPre = (s = ''): string => s.replace(/"/g, '“');
export const curlyPost = (s = ''): string => s.replace(/"/g, '”');

/** The macronized passage as displayed (curly quotes). */
export function historiaLatin(e: Pick<HistoriaEntry, 'tokens'>): string {
  return e.tokens.map((t, i) => curlyPre(t.pre) + t.w + curlyPost(t.p) + (i < e.tokens.length - 1 ? sep(t) : '')).join('');
}

/**
 * What eSpeak reads for the passage: the macronized words with their punctuation, quotation
 * marks dropped, inscription dots read as commas, and capitals as ordinary letters.
 */
export function historiaSpeech(e: Pick<HistoriaEntry, 'tokens'>): string {
  return e.tokens.map((t) => t.w.toLowerCase() + (t.p ?? '').replace(/"/g, '').replace(/·/g, ',')).join(' ').replace(/\s+/g, ' ').trim();
}

/** A word as spoken on its own (tap-to-gloss speaker). */
export const historiaWordSpeech = (t: Pick<HistoriaToken, 'w'>): string => t.w.toLowerCase();

/** Every eSpeak text a Historia entry needs: the passage, then each distinct word. */
export function historiaAudioTexts(e: Pick<HistoriaEntry, 'tokens'>): string[] {
  return [historiaSpeech(e), ...new Set(e.tokens.map(historiaWordSpeech))];
}

/**
 * The learner's unlocked vocabulary: words introduced by finished path nodes, plus every word
 * the event log shows as seen (reviewed or introduced), the same set the Words tab lists.
 */
export function learnerKnownIds(path: Pick<Path, 'nodes'>, state: Pick<DerivedState, 'done' | 'seen'>): Set<string> {
  const out = new Set<string>(state.seen);
  for (const n of path.nodes) if (state.done.has(n.id)) for (const w of n.newWords) out.add(w);
  return out;
}

/** The headword's first form: "urbs, urbis, f." → "urbs"; "capillus, -ī, m. + -que" → "capillus". */
export const tokenHead = (t: Pick<HistoriaToken, 'lemma'>): string => t.lemma.split(/,| \(| \+ /)[0]!.trim();

/** Lexicon words by first citation form, exactly as spelled (macrons count). */
export type HeadIndex = ReadonlyMap<string, readonly string[]>;
export function headIndex(lex: Pick<Lexicon, 'words'>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const w of lex.words) {
    const h = (w.lemma.parts[0] ?? w.lemma.headword).normalize('NFC');
    out.set(h, [...(out.get(h) ?? []), w.lemma.id]);
  }
  return out;
}

/**
 * The lexicon ids a token stands for: its `app` ids (Wheelock / DCC words, checked by the tests),
 * else, through the learner's own lexicon, any word with exactly the same headword (e.g. a
 * Familia Rōmāna preview word from the private pack, which the public files never name).
 */
export function tokenIds(t: HistoriaToken, heads?: HeadIndex): readonly string[] {
  if (t.app?.length) return t.app;
  if (t.nolink || !heads) return [];
  return heads.get(tokenHead(t).normalize('NFC')) ?? [];
}

/**
 * Whether the learner knows a token's word: its app ids all known, or (headword match) any
 * same-headword word known; and -que, if attached.
 */
export function tokenKnown(t: HistoriaToken, known: ReadonlySet<string>, heads?: HeadIndex): boolean {
  const ids = tokenIds(t, heads);
  if (!ids.length) return false;
  const ok = t.app?.length ? ids.every((id) => known.has(id)) : ids.some((id) => known.has(id));
  if (!ok) return false;
  return t.enclitic ? known.has('que-enclitic') : true;
}

/** Share of the passage's words the learner knows (proper names count like any word). */
export function knownShare(e: Pick<HistoriaEntry, 'tokens'>, known: ReadonlySet<string>, heads?: HeadIndex): { known: number; total: number; pct: number } {
  const total = e.tokens.length;
  const k = e.tokens.filter((t) => tokenKnown(t, known, heads)).length;
  return { known: k, total, pct: total ? Math.round((100 * k) / total) : 0 };
}

/** First-answer grading: the chosen option index against the key. */
export function gradeHistoria(e: Pick<HistoriaEntry, 'questions'>, n: number, choice: number): Grade {
  const q = e.questions[n - 1];
  if (!q) throw new Error(`no question ${n}`);
  return choice === q.answer ? 'good' : 'again';
}

/** Option order for display: a seeded rotation, so the key is not always first. */
export function optionOrder(e: Pick<HistoriaEntry, 'id' | 'questions'>, n: number): number[] {
  const q = e.questions[n - 1]!;
  let h = 0;
  for (const c of `${e.id}:${n}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const k = h % q.options.length;
  return q.options.map((_, i) => (i + k) % q.options.length);
}

const ESSAY_MIN_WORDS = 200;
const ESSAY_MAX_WORDS = 350;
export const essayWords = (e: Pick<HistoriaEntry, 'essay'>): number =>
  e.essay.flat().reduce((n, c) => n + c.t.split(/\s+/).filter(Boolean).length, 0);

/** Validate an entry (shape, tracing, glossing, citations). Throws with the reason. */
export function parseHistoriaEntry(raw: unknown): HistoriaEntry {
  const o = raw as HistoriaEntry;
  const bad = (why: string): never => { throw new Error(`historia entry ${(o as { id?: string })?.id ?? '?'}: ${why}`); };
  if (!o || typeof o !== 'object') bad('not an object');
  if (typeof o.id !== 'string' || !/^[a-z]+-[0-9]+$/.test(o.id)) bad('id');
  if (!Number.isInteger(o.order) || o.order < 1) bad('order');
  for (const k of ['title', 'saying', 'author', 'work', 'citation', 'setting', 'source_text', 'excerpt_note', 'translation', 'translation_note'] as const) {
    if (typeof o[k] !== 'string' || !o[k].trim()) bad(k);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.verified ?? '')) bad('verified date');
  if (o.verse !== undefined && o.verse !== true) bad('verse flag');
  if (!o.edition?.name || !/^https:\/\//.test(o.edition.url ?? '') || !o.edition.section) bad('edition (name, https url, section)');
  if (o.macrons?.editorial !== true || !o.macrons.note || !Array.isArray(o.macrons.uncertain)) bad('macrons note');
  if (!Array.isArray(o.tokens) || !o.tokens.length) bad('tokens');
  for (const t of o.tokens) {
    if (typeof t.w !== 'string' || !/^[\p{L}]+$/u.test(t.w)) bad(`token "${t.w}"`);
    for (const k of ['lemma', 'parse', 'gloss'] as const) if (typeof t[k] !== 'string' || !t[k].trim()) bad(`token "${t.w}" has no ${k}`);
    if (t.app !== undefined && (!Array.isArray(t.app) || !t.app.length || t.app.some((x) => typeof x !== 'string' || !x))) bad(`token "${t.w}" app ids`);
    if (t.enclitic !== undefined && (t.enclitic !== 'que' || !t.w.endsWith('que') || !t.lemma.includes('+ -que'))) bad(`token "${t.w}" enclitic`);
    if (t.nolink !== undefined && (t.nolink !== true || t.app)) bad(`token "${t.w}" nolink`);
    if (t.br !== undefined && (t.br !== true || !o.verse)) bad(`token "${t.w}" br (only in verse entries)`);
  }
  const rebuilt = tokensSourceText(o.tokens);
  if (rebuilt !== o.source_text) bad(`tokens spell "${rebuilt}", not the edition's "${o.source_text}"`);
  if (!Array.isArray(o.sources) || !o.sources.length) bad('sources');
  for (const s of o.sources) {
    if (!s.label || !/^https:\/\//.test(s.url ?? '') || (s.kind !== 'ancient' && s.kind !== 'modern')) bad(`source "${s.label}"`);
  }
  if (!o.sources.some((s) => s.url === o.edition.url)) bad('the edition is not among the sources');
  if (!Array.isArray(o.essay) || !o.essay.length) bad('essay');
  const cited = new Set<number>();
  for (const para of o.essay) {
    if (!Array.isArray(para) || !para.length) bad('essay paragraph');
    for (const c of para) {
      if (typeof c.t !== 'string' || !c.t.trim()) bad('essay claim text');
      if (!Array.isArray(c.src) || !c.src.length) bad(`claim without a source: "${c.t}"`);
      for (const i of c.src) {
        if (!Number.isInteger(i) || i < 1 || i > o.sources.length) bad(`claim cites source ${i}: "${c.t}"`);
        cited.add(i);
      }
      if (c.doubt !== undefined && c.doubt !== true) bad('doubt flag');
    }
  }
  o.sources.forEach((_, i) => { if (!cited.has(i + 1)) bad(`source ${i + 1} is never cited`); });
  const words = essayWords(o);
  if (words < ESSAY_MIN_WORDS || words > ESSAY_MAX_WORDS) bad(`essay is ${words} words (${ESSAY_MIN_WORDS}–${ESSAY_MAX_WORDS})`);
  if (!Array.isArray(o.questions) || o.questions.length < 2 || o.questions.length > 3) bad('2–3 questions');
  for (const q of o.questions) {
    if (!q.q || !Array.isArray(q.options) || q.options.length < 2 || new Set(q.options).size !== q.options.length) bad(`question "${q.q}"`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) bad(`answer of "${q.q}"`);
  }
  return o;
}
