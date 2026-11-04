/**
 * Sentence exercises: the sentence bank's shape, word-order rules, English answer
 * normalization, eligibility (only unlocked words and endings), and the four
 * exercise types. Pure: no UI, no storage. See README "Sentence exercises".
 */
import type { CellId, Lemma } from '../morph/types.ts';
import { generate } from '../morph/generate.ts';
import { nfc } from '../morph/phonology.ts';
import { featureOfCell, hasFeature, type FeatureId } from './curriculum.ts';
import type { Lexicon } from './lexicon.ts';
import type { DerivedState } from './events.ts';
import { cellLabel } from './labels.ts';
import { isDue, retrievability } from './srs.ts';
import { shuffle, type Comparison, type Rng } from './util.ts';

/* ---------------- bank schema ---------------- */

export type Role = 'subj' | 'obj' | 'iobj' | 'verb' | 'pred' | 'voc';
export const ROLES: readonly Role[] = ['subj', 'obj', 'iobj', 'verb', 'pred', 'voc'];

export interface Token {
  /** The generated form, with macrons (without any enclitic). */
  form: string;
  /** Lemma id as the lexicon makes them ("puella-n1", "sum-irr-sum", "in-indecl"). */
  lemma: string;
  /** Morphology cell ("nom.sg", "acc.pl.f", "pres.act.ind.3sg", "citation" for indeclinables). */
  cell: CellId;
  role?: Role;
  /** An enclitic written onto this word: -que (lemma que-enclitic) or -ne (ne-enclitic). */
  attach?: 'que' | 'ne';
  /** This word heads a unit with the next `phrase` tokens (a preposition + its object; Ō + a vocative). */
  phrase?: number;
  /** A comma follows this word in the printed sentence. */
  comma?: boolean;
}

export type OrderKind = 'free' | 'fixed' | 'first' | 'coord';
/** Word-order tree: a token index, or [kind, ...children]. */
export type OrderNode = number | [OrderKind, ...OrderNode[]];

export interface Sentence {
  id: string;
  /** First section the sentence may appear in. */
  section: number;
  tokens: Token[];
  /** Accepted English translations. `{a|b}` = alternatives, `[x]` = optional word(s). The first, expanded with
   *  the first alternative and every optional word, is the one shown. */
  en: string[];
  punct?: '.' | '?' | '!';
  /** Explicit word-order tree; when absent it is derived (see `orderTree`). */
  order?: OrderNode;
}

export type SentType = 'cloze' | 'en' | 'subj' | 'obj' | 'la';
export const SENT_TYPES: readonly SentType[] = ['cloze', 'en', 'subj', 'obj', 'la'];
export const sentenceCard = (id: string, type: SentType): string => `sent:${id}:${type}`;
export function parseSentenceCard(card: string): { id: string; type: SentType } | null {
  const m = /^sent:([^:]+):([a-z]+)$/.exec(card);
  return m && (SENT_TYPES as readonly string[]).includes(m[2]!) ? { id: m[1]!, type: m[2] as SentType } : null;
}

/** Validate raw bank JSON (an array of sentences). Throws with the sentence id and reason. */
export function parseSentences(raw: unknown): Sentence[] {
  if (!Array.isArray(raw)) throw new Error('sentence file: not an array');
  return raw.map((r, i) => {
    const s = r as Sentence;
    const bad = (why: string): never => { throw new Error(`sentence ${s?.id ?? i}: ${why}`); };
    if (!s || typeof s !== 'object') bad('not an object');
    if (typeof s.id !== 'string' || !/^[a-z0-9-]+$/.test(s.id)) bad('id');
    if (!Number.isInteger(s.section) || s.section < 1) bad('section');
    if (!Array.isArray(s.tokens) || s.tokens.length < 1) bad('tokens');
    s.tokens.forEach((t, j) => {
      if (typeof t.form !== 'string' || !t.form) bad(`token ${j} form`);
      if (typeof t.lemma !== 'string' || !t.lemma) bad(`token ${j} lemma`);
      if (typeof t.cell !== 'string' || !t.cell) bad(`token ${j} cell`);
      if (t.role !== undefined && !ROLES.includes(t.role)) bad(`token ${j} role`);
      if (t.attach !== undefined && t.attach !== 'que' && t.attach !== 'ne') bad(`token ${j} attach`);
      if (t.phrase !== undefined && (!Number.isInteger(t.phrase) || t.phrase < 1 || j + t.phrase >= s.tokens.length)) bad(`token ${j} phrase`);
    });
    if (!Array.isArray(s.en) || s.en.length < 1 || s.en.some((e) => typeof e !== 'string' || !e.trim())) bad('en');
    if (s.punct !== undefined && !['.', '?', '!'].includes(s.punct)) bad('punct');
    const err = orderError(s);
    if (err) bad(err);
    return { ...s, tokens: s.tokens.map((t) => ({ ...t, form: nfc(t.form) })) };
  });
}

/* ---------------- Latin text ---------------- */

/** A word as written in the sentence: the form plus any enclitic (puellaeque, cēnābitisne). */
export const tokenText = (t: Token): string => t.form + (t.attach ?? '');

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The printed sentence: "Puerī puellaeque ibi erant." */
export function latinText(s: Sentence, tokens: readonly Token[] = s.tokens): string {
  const words = tokens.map((t, i) => tokenText(t) + (t.comma && i < tokens.length - 1 ? ',' : ''));
  return cap(words.join(' ')) + (s.punct ?? '.');
}

/* ---------------- word order ---------------- */

/**
 * The word-order tree. Explicit `order` wins. Otherwise everything is free except:
 *  - a token with `phrase: n` + the next n tokens form a unit, head first (in agrō magnō);
 *  - nōn + the next word (or unit) stay together in that order;
 *  - a word carrying -que follows the word before it directly (puerī puellaeque);
 *  - a word carrying -ne comes first.
 */
export function orderTree(s: Sentence): OrderNode {
  if (s.order !== undefined) return s.order;
  const n = s.tokens.length;
  const units: OrderNode[] = [];
  for (let i = 0; i < n;) {
    const t = s.tokens[i]!;
    if (t.phrase) {
      const inner = Array.from({ length: t.phrase }, (_, k) => i + 1 + k);
      units.push(['first', i, inner.length > 1 ? ['free', ...inner] : inner[0]!]);
      i += 1 + t.phrase;
    } else { units.push(i); i++; }
  }
  // nōn + the following unit; -que word + the preceding unit.
  const merged: OrderNode[] = [];
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    const tok = typeof u === 'number' ? s.tokens[u]! : null;
    if (tok && tok.lemma === 'non-indecl' && k + 1 < units.length) { merged.push(['fixed', u, units[++k]!]); continue; }
    const next = units[k + 1];
    if (next !== undefined && typeof next === 'number' && s.tokens[next]!.attach === 'que') { merged.push(['fixed', u, next]); k++; continue; }
    merged.push(u);
  }
  const ne = merged.findIndex((u) => typeof u === 'number' && s.tokens[u]!.attach === 'ne');
  if (ne >= 0) return ['first', merged[ne]!, ...merged.filter((_, k) => k !== ne)];
  return merged.length === 1 ? merged[0]! : ['free', ...merged];
}

function leaves(node: OrderNode): number[] {
  return typeof node === 'number' ? [node] : node.slice(1).flatMap((c) => leaves(c as OrderNode));
}

/** Why a sentence's order tree is invalid, or null. */
export function orderError(s: Sentence): string | null {
  const check = (node: OrderNode): string | null => {
    if (typeof node === 'number') return Number.isInteger(node) && node >= 0 && node < s.tokens.length ? null : `order: bad index ${node}`;
    if (!Array.isArray(node) || !['free', 'fixed', 'first', 'coord'].includes(node[0] as string)) return 'order: bad node';
    if (node.length < 2) return 'order: empty node';
    if (node[0] === 'coord' && node.length !== 4) return 'order: coord needs [A, conj, B]';
    for (const c of node.slice(1)) { const e = check(c as OrderNode); if (e) return e; }
    return null;
  };
  let tree: OrderNode;
  try { tree = orderTree(s); } catch { return 'order: cannot derive'; }
  const e = check(tree);
  if (e) return e;
  const ls = leaves(tree).sort((a, b) => a - b);
  if (ls.length !== s.tokens.length || ls.some((x, i) => x !== i)) return 'order: must use every token exactly once';
  if (!linearize(tree, 6000).some((seq) => seq.every((x, i) => x === i))) return 'order: the written order is not allowed by its own tree';
  return null;
}

function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  const out: T[][] = [];
  xs.forEach((x, i) => { for (const p of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) out.push([x, ...p]); });
  return out;
}

/** Every token-index sequence the tree allows (capped at `limit`). */
export function linearize(node: OrderNode, limit = 20000): number[][] {
  if (typeof node === 'number') return [[node]];
  const [kind, ...kids] = node as [OrderKind, ...OrderNode[]];
  const kidSeqs = kids.map((k) => linearize(k, limit));
  const orders: number[][] = kind === 'fixed' ? [kids.map((_, i) => i)]
    : kind === 'first' ? permutations(kids.slice(1).map((_, i) => i + 1)).map((p) => [0, ...p])
    : kind === 'coord' ? [[0, 1, 2], [2, 1, 0]]
    : permutations(kids.map((_, i) => i));
  const out: number[][] = [];
  for (const ord of orders) {
    let acc: number[][] = [[]];
    for (const k of ord) {
      const next: number[][] = [];
      for (const a of acc) for (const b of kidSeqs[k]!) { next.push([...a, ...b]); if (next.length >= limit) break; }
      acc = next;
    }
    for (const a of acc) { out.push(a); if (out.length >= limit) return out; }
  }
  return out;
}

/** Accepted Latin word sequences (written words, lowercase as in the tiles), joined by spaces. */
export function latinOrders(s: Sentence): Set<string> {
  return new Set(linearize(orderTree(s)).map((seq) => seq.map((i) => tokenText(s.tokens[i]!)).join(' ')));
}

/** True if the words, in this order, are the sentence's exact forms in an allowed order. */
export function checkLatinOrder(s: Sentence, words: readonly string[]): boolean {
  return latinOrders(s).has(words.map((w) => nfc(w.trim())).join(' '));
}

/* ---------------- English ---------------- */

/** Expand `{a|b}` alternatives and `[optional]` words into every accepted sentence. */
export function expandEnglish(src: string): string[] {
  const m = /\{([^{}]*)\}|\[([^[\]]*)\]/.exec(src);
  if (!m) return [src.replace(/\s+/g, ' ').trim()];
  const before = src.slice(0, m.index);
  const after = src.slice(m.index + m[0].length);
  const choices = m[1] !== undefined ? m[1].split('|') : [m[2]!, ''];
  return choices.flatMap((c) => expandEnglish(before + c + after));
}

/** The English shown to the learner: first alternative, optional words included. */
export function displayEnglish(src: string): string {
  return src.replace(/\{([^{}|]*)(\|[^{}]*)?\}/g, '$1').replace(/\[([^[\]]*)\]/g, '$1').replace(/\s+/g, ' ').trim();
}

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, 'can not'], [/\bcannot\b/g, 'can not'], [/\bwon't\b/g, 'will not'], [/\bshan't\b/g, 'shall not'],
  [/\b(\w+)n't\b/g, '$1 not'], [/\bi'm\b/g, 'i am'], [/\b(you|we|they)'re\b/g, '$1 are'],
  [/\b(he|she|it|that|there|what|where|who)'s\b/g, '$1 is'], [/\b(i|you|we|they)'ll\b/g, '$1 will'],
  [/\b(he|she|it)'ll\b/g, '$1 will'], [/\b(i|you|we|they)'ve\b/g, '$1 have'],
];
export const ARTICLES = new Set(['a', 'an', 'the']);

/**
 * Normalize English for comparison: case, curly quotes, punctuation and spacing ignored;
 * common contractions expanded (don't = do not); and the articles a / an / the made
 * interchangeable (Latin has none, so "a rose" and "the rose" translate rosam equally).
 * Whether an article is there at all still counts: "the girl loves roses" ≠ "girl loves roses".
 */
export function normalizeEnglish(s: string): string {
  let t = s.normalize('NFC').toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”"]/g, ' ');
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  t = t.replace(/[.,!?;:()…–—]/g, ' ').replace(/(^|\s)'+|'+(\s|$)/g, ' ');
  return t.split(/\s+/).filter(Boolean).map((w) => (ARTICLES.has(w) ? 'the' : w)).join(' ');
}

/** Every accepted English answer, normalized. */
export function acceptedEnglish(s: Sentence): Set<string> {
  return new Set(s.en.flatMap(expandEnglish).map(normalizeEnglish));
}

export const checkEnglish = (s: Sentence, answer: string): boolean => acceptedEnglish(s).has(normalizeEnglish(answer));

/** English words kept capitalized on tiles. */
const PROPER = /^(I|I'm|I'll|I've|Cicero|Cicero's|Roman|Romans|Rome|Greek|Greeks|Greece)$/;
/** The shown English split into tile words: punctuation off, lowercase except I and names. */
export function englishWords(src: string): string[] {
  return displayEnglish(src).split(/\s+/).map((w) => w.replace(/^[“"(]+|[.,!?;:”")]+$/g, ''))
    .filter(Boolean).map((w) => (PROPER.test(w) ? w : w.toLowerCase()));
}

/* ---------------- eligibility ---------------- */

const ENCLITIC: Record<'que' | 'ne', string> = { que: 'que-enclitic', ne: 'ne-enclitic' };

/** Lemma ids a sentence uses (including enclitics) and the features its forms need. */
export function sentenceNeeds(s: Sentence, lex: Pick<Lexicon, 'byId'>): { lemmas: string[]; features: FeatureId[]; missing: string[] } {
  const lemmas = new Set<string>();
  const features = new Set<FeatureId>();
  const missing: string[] = [];
  for (const t of s.tokens) {
    lemmas.add(t.lemma);
    if (t.attach) lemmas.add(ENCLITIC[t.attach]);
    const w = lex.byId.get(t.lemma);
    if (!w) { missing.push(t.lemma); continue; }
    if (w.lemma.paradigm === 'indecl') continue;
    const f = featureOfCell(w.lemma, t.cell);
    if (f) features.add(f); else missing.push(`${t.lemma}:${t.cell}`);
  }
  return { lemmas: [...lemmas], features: [...features], missing };
}

export interface SentCtx {
  lex: Lexicon;
  /** Lemma ids the learner knows. */
  known: ReadonlySet<string>;
  unlocked: ReadonlySet<FeatureId>;
  /** The learner's section: sentences from later sections never show. */
  section: number;
}

/** A sentence may show if its section is reached, every word is known and every ending unlocked. */
export function sentenceEligible(s: Sentence, c: SentCtx): boolean {
  if (s.section > c.section) return false;
  const n = sentenceNeeds(s, c.lex);
  if (n.missing.length) return false;
  for (const t of s.tokens) if (generate(c.lex.byId.get(t.lemma)!.lemma)[t.cell] !== t.form) return false;
  return n.lemmas.every((l) => c.known.has(l)) && n.features.every((f) => hasFeature(c.unlocked, f));
}

/* ---------------- exercises ---------------- */

export interface SentOption { id: string; text: string; la?: boolean }

export interface SentenceExercise {
  id: string;
  type: 'sentence';
  kind: SentType;
  card: string;
  sentence: string;
  prompt: string;
  /** The Latin line shown (cloze: with one blank). Empty for English → Latin. */
  words: { text: string; blank?: boolean }[];
  /** English: the hint (cloze), the cue (la), or the answer shown in feedback (en, subj, obj). */
  en: string;
  /** cloze: forms; subj/obj: one per word (+ "none"); en/la: tiles. */
  options: SentOption[];
  /** cloze/subj/obj: the correct option ids; en/la: one correct tile order (the reference). */
  answer: string[];
  multi: boolean;
  /** Correct answer as text, for feedback. */
  expected: string;
  note: string;
  s: Sentence;
}

const FINITE = /^(pres|fut|impf)\.act\.(ind\.|imp\.)/;
const isFinite = (t: Token): boolean => FINITE.test(t.cell);

/** Whether an exercise type can be built for this sentence (with the unlocked endings). */
export function canBuild(s: Sentence, type: SentType, c: SentCtx): boolean {
  switch (type) {
    case 'cloze': return clozeTargets(s, c).length > 0;
    case 'en': return englishWords(s.en[0]!).length >= 2;
    case 'subj': return s.tokens.filter(isFinite).length === 1;
    case 'obj': return s.tokens.filter(isFinite).length === 1 && s.tokens.some((t) => t.role === 'obj');
    case 'la': return s.tokens.length >= 2 && latinDistractorCandidates(s, c).length > 0;
  }
}

/** Unlocked cells of a lemma with their forms. */
function unlockedForms(l: Lemma, unlocked: ReadonlySet<FeatureId>): [CellId, string][] {
  return (Object.entries(generate(l)) as [CellId, string][])
    .filter(([cell, f]) => { const ft = featureOfCell(l, cell); return f !== undefined && ft !== null && hasFeature(unlocked, ft); });
}

/** Cells the English can't tell apart from the token's own (you sg. / you pl.). */
function sameInEnglish(a: CellId, b: CellId): boolean {
  const pa = /(\d)(sg|pl)$/.exec(a);
  const pb = /(\d)(sg|pl)$/.exec(b);
  return !!pa && !!pb && pa[1] === '2' && pb[1] === '2' && a.slice(0, -3) === b.slice(0, -3);
}

/** Token indices that can be blanked: declinable, with ≥ 3 other distinct unlocked forms. */
export function clozeTargets(s: Sentence, c: SentCtx): number[] {
  return s.tokens.map((t, i) => ({ t, i })).filter(({ t }) => clozeDistractorPool(t, c).length >= 3).map(({ i }) => i);
}

function clozeDistractorPool(t: Token, c: SentCtx): [CellId, string][] {
  const w = c.lex.byId.get(t.lemma);
  if (!w || w.lemma.paradigm === 'indecl') return [];
  const seen = new Set<string>([t.form]);
  const out: [CellId, string][] = [];
  for (const [cell, f] of unlockedForms(w.lemma, c.unlocked)) {
    if (seen.has(f) || sameInEnglish(cell, t.cell)) continue;
    seen.add(f);
    out.push([cell, f]);
  }
  return out;
}

/** How close a distractor cell is to the right one (lower = closer: same number / tense first). */
function closeness(a: CellId, b: CellId): number {
  const pa = a.split('.');
  const pb = b.split('.');
  return pa.filter((x, i) => x !== pb[i]).length;
}

function latinDistractorCandidates(s: Sentence, c: SentCtx): { tok: number; form: string; cell: CellId }[] {
  const used = new Set(s.tokens.map((t) => t.form));
  const out: { tok: number; form: string; cell: CellId }[] = [];
  s.tokens.forEach((t, i) => {
    const w = c.lex.byId.get(t.lemma);
    if (!w || w.lemma.paradigm === 'indecl') return;
    for (const [cell, f] of unlockedForms(w.lemma, c.unlocked)) if (!used.has(f) && !sameInEnglish(cell, t.cell)) out.push({ tok: i, form: f, cell });
  });
  return out;
}

const roleLabel: Record<'subj' | 'obj', string> = { subj: 'subject', obj: 'direct object' };

export interface BuildDeps extends SentCtx {
  rng: Rng;
  nextId: () => string;
  /** Other sentences whose English supplies distractor tiles. */
  pool: readonly Sentence[];
  /** Cloze: prefer blanking a word whose ending has one of these features. */
  focus?: readonly FeatureId[];
}

export function buildSentenceExercise(s: Sentence, type: SentType, d: BuildDeps): SentenceExercise | null {
  if (!canBuild(s, type, d)) return null;
  const latin = latinText(s);
  const en = displayEnglish(s.en[0]!);
  const base = { id: d.nextId(), type: 'sentence' as const, kind: type, card: sentenceCard(s.id, type), sentence: s.id, en, s };
  const shown = s.tokens.map((t, i) => ({ text: tokenText(t) + (t.comma && i < s.tokens.length - 1 ? ',' : '') }));
  if (shown[0]) shown[0].text = cap(shown[0].text);
  switch (type) {
    case 'cloze': {
      const targets = clozeTargets(s, d);
      const focused = d.focus ? targets.filter((i) => {
        const l = d.lex.byId.get(s.tokens[i]!.lemma)!.lemma;
        const f = featureOfCell(l, s.tokens[i]!.cell);
        return f !== null && d.focus!.includes(f);
      }) : [];
      const pickFrom = focused.length ? focused : targets;
      const i = pickFrom[Math.floor(d.rng() * pickFrom.length)]!;
      const t = s.tokens[i]!;
      const pool = shuffle(clozeDistractorPool(t, d), d.rng).sort((a, b) => closeness(a[0], t.cell) - closeness(b[0], t.cell));
      const opts = shuffle([{ id: 'a', text: t.form, la: true }, ...pool.slice(0, 3).map(([, f], k) => ({ id: `d${k}`, text: f, la: true }))], d.rng);
      const words = s.tokens.map((tk, k) => (k === i ? { text: '', blank: true } : { text: shown[k]!.text }));
      const l = d.lex.byId.get(t.lemma)!.lemma;
      return {
        ...base, prompt: 'Choose the missing word', words, options: opts, answer: ['a'], multi: false,
        expected: t.form, note: `${latin} ${en} ${t.form}: ${cellLabel(t.cell)} of ${l.parts[0]}.`,
      };
    }
    case 'en': {
      const ref = englishWords(s.en[0]!);
      const accepted = new Set(s.en.flatMap(expandEnglish).flatMap((e) => normalizeEnglish(e).split(' ')));
      const cand = [...new Set(d.pool.filter((o) => o.id !== s.id).flatMap((o) => englishWords(o.en[0]!)))]
        .filter((w) => !ARTICLES.has(w.toLowerCase()) && !accepted.has(normalizeEnglish(w)) && !ref.includes(w));
      const n = ref.length <= 6 ? 3 : 2;
      const extra = shuffle(cand.sort(), d.rng).slice(0, n);
      const tiles = shuffle([...ref.map((w, k) => ({ id: `t${k}`, text: w })), ...extra.map((w, k) => ({ id: `d${k}`, text: w }))], d.rng);
      return {
        ...base, prompt: 'Translate into English', words: shown, options: tiles, answer: ref.map((_, k) => `t${k}`), multi: false,
        expected: en, note: `${latin} ${en}`,
      };
    }
    case 'subj': case 'obj': {
      const idx = s.tokens.map((t, i) => (t.role === type ? i : -1)).filter((i) => i >= 0);
      const opts: SentOption[] = shown.map((w, i) => ({ id: `w${i}`, text: w.text.replace(/,$/, ''), la: true }));
      if (type === 'subj') opts.push({ id: 'none', text: 'No written subject' });
      const answer = idx.length ? idx.map((i) => `w${i}`) : ['none'];
      const verb = s.tokens.find(isFinite)!;
      const note = idx.length
        ? `${idx.map((i) => `${tokenText(s.tokens[i]!)} (${cellLabel(s.tokens[i]!.cell)})`).join(' and ')}: the ${roleLabel[type]}. ${en}`
        : `No subject is written: the ending of ${verb.form} supplies it. ${en}`;
      return {
        ...base, prompt: type === 'subj' ? (idx.length > 1 ? 'Tap the subjects' : 'Tap the subject') : (idx.length > 1 ? 'Tap the direct objects' : 'Tap the direct object'),
        words: shown, options: opts, answer, multi: idx.length > 1,
        expected: idx.length ? idx.map((i) => tokenText(s.tokens[i]!)).join(', ') : 'No written subject', note,
      };
    }
    case 'la': {
      const cands = shuffle(latinDistractorCandidates(s, d), d.rng)
        .sort((a, b) => closeness(a.cell, s.tokens[a.tok]!.cell) - closeness(b.cell, s.tokens[b.tok]!.cell));
      const want = s.tokens.length >= 4 ? 2 : 1;
      const picked: typeof cands = [];
      for (const c of cands) {
        if (picked.length >= want) break;
        if (picked.some((p) => p.tok === c.tok || p.form === c.form)) continue;
        picked.push(c);
      }
      const tiles = shuffle([
        ...s.tokens.map((t, k) => ({ id: `t${k}`, text: tokenText(t), la: true })),
        ...picked.map((p, k) => ({ id: `d${k}`, text: p.form + (s.tokens[p.tok]!.attach ?? ''), la: true })),
      ], d.rng);
      return {
        ...base, prompt: 'Translate into Latin', words: [], options: tiles, answer: s.tokens.map((_, k) => `t${k}`), multi: false,
        expected: latin, note: `${latin} Other word orders work too, as long as phrases stay together.`,
      };
    }
  }
}

/** Grade a sentence exercise. `picked`: chosen option ids (cloze, subj, obj) or tile ids in order (en, la). */
export function checkSentence(ex: SentenceExercise, picked: readonly string[]): Comparison {
  const text = (id: string) => ex.options.find((o) => o.id === id)?.text ?? '';
  let ok: boolean;
  switch (ex.kind) {
    case 'cloze': case 'subj': case 'obj':
      ok = [...new Set(picked)].sort().join('|') === [...ex.answer].sort().join('|');
      break;
    case 'en': ok = picked.length > 0 && checkEnglish(ex.s, picked.map(text).join(' ')); break;
    case 'la': ok = picked.length > 0 && checkLatinOrder(ex.s, picked.map(text)); break;
  }
  return { ok, macronMiss: false, expected: ex.expected };
}

/* ---------------- choosing sentences for a lesson ---------------- */

export interface ChooseOpts extends SentCtx {
  bank: readonly Sentence[];
  state: Pick<DerivedState, 'cards'>;
  now: Date;
  count: number;
  rng: Rng;
  focus?: readonly FeatureId[];
}

/**
 * Pick up to `count` (sentence, type) pairs, one per sentence: due cards first (lowest
 * retrievability), then never-practised ones, then the rest; sentences using the focus
 * features lead when given; exercise types are spread out. Deterministic for a given rng.
 */
export function chooseSentences(o: ChooseOpts): { s: Sentence; type: SentType }[] {
  const eligible = o.bank.filter((s) => sentenceEligible(s, o));
  const hasFocus = (s: Sentence) => !!o.focus && s.tokens.some((t) => {
    const w = o.lex.byId.get(t.lemma);
    const f = w ? featureOfCell(w.lemma, t.cell) : null;
    return f !== null && o.focus!.includes(f);
  });
  const cands: { s: Sentence; type: SentType; tier: number; r: number; tie: number }[] = [];
  for (const s of eligible) {
    for (const type of SENT_TYPES) {
      if (!canBuild(s, type, o)) continue;
      const card = o.state.cards.get(sentenceCard(s.id, type));
      const tier = (hasFocus(s) ? 0 : 3) + (!card ? 1 : isDue(card, o.now) ? 0 : 2);
      cands.push({ s, type, tier, r: card ? retrievability(card, o.now) : 0, tie: o.rng() });
    }
  }
  cands.sort((a, b) => a.tier - b.tier || a.r - b.r || a.tie - b.tie);
  const out: { s: Sentence; type: SentType }[] = [];
  const typeCount = new Map<SentType, number>();
  const maxPerType = Math.max(1, Math.ceil(o.count / 3));
  // Pass 0: one per sentence, types spread; pass 1: any type; pass 2 (few sentences): a second type of a sentence.
  for (const pass of [0, 1, 2]) {
    for (const c of cands) {
      if (out.length >= o.count) break;
      if (out.some((x) => x.s.id === c.s.id && (pass < 2 || x.type === c.type))) continue;
      if (pass === 0 && (typeCount.get(c.type) ?? 0) >= maxPerType) continue;
      out.push({ s: c.s, type: c.type });
      typeCount.set(c.type, (typeCount.get(c.type) ?? 0) + 1);
    }
  }
  return out;
}
