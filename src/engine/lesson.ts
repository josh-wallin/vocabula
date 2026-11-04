/**
 * Lesson builder: turns a path node + the learner's derived state into an
 * ordered list of exercises. Deterministic for a given seed.
 */
import type { CellId, Gender, Lemma } from '../morph/types.ts';
import { generate } from '../morph/generate.ts';
import { analyze } from '../morph/analyze.ts';
import { featureOfCell, genderOptions, hasFeature, type FeatureId } from './curriculum.ts';
import { citation, classNote, glossKey, type Lexicon } from './lexicon.ts';
import type { Path, PathNode } from './path.ts';
import type { DerivedState } from './events.ts';
import { cardId, isDue, parseCardId, retrievability } from './srs.ts';
import { cellLabel, cellPrompt, genderName } from './labels.ts';
import { hashSeed, pick, rng, shuffle, type Rng } from './util.ts';

export interface Option { id: string; text: string; la?: boolean }

export type Exercise =
  | { id: string; type: 'grammar'; kind: 'grammar'; section: number }
  | { id: string; type: 'intro'; kind: 'intro'; lemma: string }
  | {
      id: string; type: 'choice'; kind: 'meaning' | 'gender' | 'conj' | 'parse';
      lemma: string; card: string; prompt: string; cue: string; cueLa: boolean;
      options: Option[]; answer: string[]; multi: boolean; note: string;
    }
  | {
      id: string; type: 'typed'; kind: 'recall' | 'produce';
      lemma: string; card: string; prompt: string; cue: string; cueLa: boolean; hint: string;
      accepted: string[]; note: string;
    };

export type ChoiceExercise = Extract<Exercise, { type: 'choice' }>;
export type TypedExercise = Extract<Exercise, { type: 'typed' }>;
export type GradedExercise = ChoiceExercise | TypedExercise;
export const isGraded = (e: Exercise): e is GradedExercise => e.type === 'choice' || e.type === 'typed';

export const LESSON_SIZE = 12;
export const REVIEW_SIZE = 13;
export const PROBATIO_SIZE = 20;
export const MIN_MEANING_FOR_RECALL = 2;

export interface BuildCtx {
  lex: Lexicon;
  path: Path;
  state: DerivedState;
  now: Date;
  /** Features available to this lesson (the learner's frontier, which includes the node's own). */
  unlocked: ReadonlySet<FeatureId>;
  seed: string;
}

/* ---------------- exercise factories ---------------- */

class Factory {
  private n = 0;
  readonly r: Rng;
  constructor(private ctx: BuildCtx, readonly known: ReadonlySet<string>) {
    this.r = rng(hashSeed(ctx.seed));
  }
  private nextId(): string { return `x${++this.n}`; }
  lemma(id: string): Lemma { const w = this.ctx.lex.byId.get(id); if (!w) throw new Error(`unknown lemma ${id}`); return w.lemma; }

  grammar(section: number): Exercise { return { id: this.nextId(), type: 'grammar', kind: 'grammar', section }; }
  intro(lemma: string): Exercise { return { id: this.nextId(), type: 'intro', kind: 'intro', lemma }; }

  meaning(id: string): Exercise {
    const l = this.lemma(id);
    const distractors = this.distractors(l, 3);
    const opts = shuffle([{ id: 'a', text: l.gloss }, ...distractors.map((d, i) => ({ id: `d${i}`, text: d.gloss }))], this.r);
    return {
      id: this.nextId(), type: 'choice', kind: 'meaning', lemma: id, card: cardId(id, 'meaning'),
      prompt: 'What does this mean?', cue: citation(l), cueLa: true, options: opts, answer: ['a'], multi: false,
      note: `${citation(l)}${l.gender ? ` (${l.gender}.)` : ''}: ${l.gloss}.`,
    };
  }

  /** English → Latin typed. Only for words with enough correct meaning reviews. */
  recall(id: string): Exercise {
    const l = this.lemma(id);
    const accepted = recallAnswers(l);
    const hint = [classNote(l), l.gender ? `${genderName(l.gender)}` : '', nominativeHint(l)].filter(Boolean).join(' · ');
    return {
      id: this.nextId(), type: 'typed', kind: 'recall', lemma: id, card: cardId(id, 'recall'),
      prompt: 'Type the Latin for', cue: l.gloss, cueLa: false, hint, accepted,
      note: `${citation(l)}${l.gender ? ` (${l.gender}.)` : ''}: ${l.gloss}.`,
    };
  }

  /** Gender or conjugation tap, or null if this word has no class question unlocked. */
  klass(id: string): Exercise | null {
    const l = this.lemma(id);
    const u = this.ctx.unlocked;
    if ((l.paradigm === 'v1' || l.paradigm === 'v2') && u.has('conj')) {
      const ans = l.paradigm === 'v1' ? '1' : '2';
      return {
        id: this.nextId(), type: 'choice', kind: 'conj', lemma: id, card: cardId(id, 'class'),
        prompt: '1st or 2nd conjugation?', cue: citation(l), cueLa: true,
        options: [{ id: '1', text: '1st conjugation' }, { id: '2', text: '2nd conjugation' }], answer: [ans], multi: false,
        note: `${l.parts[1]}: the vowel before -re is ${ans === '1' ? 'ā, so 1st' : 'ē, so 2nd'} conjugation.`,
      };
    }
    if (l.pos === 'noun' && l.gender) {
      const gs = genderOptions(u);
      if (gs.length < 2 || !gs.includes(l.gender)) return null;
      return {
        id: this.nextId(), type: 'choice', kind: 'gender', lemma: id, card: cardId(id, 'class'),
        prompt: 'Which gender?', cue: citation(l), cueLa: true,
        options: gs.map((g) => ({ id: g, text: genderName(g) })), answer: [l.gender], multi: false,
        note: genderNote(l),
      };
    }
    return null;
  }

  /** Cells of a lemma that may be drilled now, optionally limited to some features. */
  cells(l: Lemma, only?: readonly FeatureId[]): CellId[] {
    const forms = generate(l);
    return (Object.keys(forms) as CellId[]).filter((c) => {
      const f = featureOfCell(l, c);
      return f !== null && hasFeature(this.ctx.unlocked, f) && (!only || only.includes(f));
    });
  }

  /** Parse: show a form, pick its analysis (select all that fit when ambiguous). */
  parse(id: string, cell: CellId): Exercise | null {
    const l = this.lemma(id);
    const forms = generate(l);
    const form = forms[cell];
    const f = featureOfCell(l, cell);
    if (!form || !f) return null;
    const allowed = new Set(this.cells(l));
    const hits = analyze(form, [l]).map((a) => a.cell).filter((c) => allowed.has(c));
    const answerCells = [...new Set(hits)];
    const others = shuffle([...allowed].filter((c) => forms[c] !== form), this.r);
    const nDistractors = Math.max(2, 4 - answerCells.length);
    if (others.length < 1) return null;
    const chosen = shuffle([...answerCells, ...others.slice(0, nDistractors)], this.r);
    const opts = chosen.map((c) => ({ id: c, text: cellLabel(c) }));
    const multi = answerCells.length > 1;
    return {
      id: this.nextId(), type: 'choice', kind: 'parse', lemma: id, card: cardId(id, 'forms', f),
      prompt: multi ? 'Which forms could this be?' : 'Which form is this?', cue: form, cueLa: true,
      options: opts, answer: answerCells, multi,
      note: `${form} (${l.parts[0]}): ${answerCells.map(cellLabel).join('; ')}.`,
    };
  }

  /** Produce: "Give the [cell] of [lemma]". */
  produce(id: string, cell: CellId): Exercise | null {
    const l = this.lemma(id);
    const form = generate(l)[cell];
    const f = featureOfCell(l, cell);
    if (!form || !f) return null;
    return {
      id: this.nextId(), type: 'typed', kind: 'produce', lemma: id, card: cardId(id, 'forms', f),
      prompt: `Give the ${cellPrompt(cell)} of`, cue: citation(l), cueLa: true,
      hint: [l.gender ? `${l.gender}.` : '', l.gloss].filter(Boolean).join(' · '),
      accepted: [form], note: `${form}: ${cellPrompt(cell)} of ${l.parts[0]}.`,
    };
  }

  /** A forms exercise for a lemma + feature: parse or produce, alternating by `preferParse`. */
  forms(id: string, feature: FeatureId, preferParse: boolean): Exercise | null {
    const l = this.lemma(id);
    const cells = this.cells(l, [feature]);
    const cell = pick(cells, this.r);
    if (!cell) return null;
    return preferParse ? (this.parse(id, cell) ?? this.produce(id, cell)) : (this.produce(id, cell) ?? this.parse(id, cell));
  }

  /** Exercise for an existing (or planned) card id. */
  forCard(card: string, preferParse = this.r() < 0.5): Exercise | null {
    const p = parseCardId(card);
    if (!p || !this.ctx.lex.byId.has(p.lemma)) return null;
    switch (p.kind) {
      case 'meaning': return this.meaning(p.lemma);
      case 'recall':
        return (this.ctx.state.meaningGood.get(p.lemma) ?? 0) >= MIN_MEANING_FOR_RECALL ? this.recall(p.lemma) : this.meaning(p.lemma);
      case 'class': return this.klass(p.lemma);
      case 'forms': return hasFeature(this.ctx.unlocked, p.feature as FeatureId) ? this.forms(p.lemma, p.feature as FeatureId, preferParse) : null;
    }
  }

  /** Same-POS distractor lemmas: already-seen words first, never an overlapping gloss. */
  distractors(l: Lemma, n: number): Lemma[] {
    const all = this.ctx.lex.words.map((w) => w.lemma).filter((x) => x.id !== l.id && !glossOverlap(x.gloss, l.gloss));
    const used = new Set<string>([glossKey(l.gloss)]);
    const out: Lemma[] = [];
    const tiers = [
      all.filter((x) => x.pos === l.pos && this.known.has(x.id)),
      all.filter((x) => x.pos === l.pos && !this.known.has(x.id) && this.ctx.lex.byId.get(x.id)?.origin === 'wheelock'),
      all.filter((x) => x.pos === l.pos),
      all.filter((x) => this.known.has(x.id)),
      all,
    ];
    for (const tier of tiers) {
      for (const x of shuffle(tier, this.r)) {
        if (out.length >= n) return out;
        const k = glossKey(x.gloss);
        if (used.has(k) || out.some((o) => glossOverlap(o.gloss, x.gloss))) continue;
        used.add(k);
        out.push(x);
      }
    }
    return out;
  }
}

/** Whether a gender / conjugation question exists for a word with the unlocked features. */
export function hasClassQuestion(l: Lemma, u: ReadonlySet<FeatureId>): boolean {
  if (l.paradigm === 'v1' || l.paradigm === 'v2') return u.has('conj');
  if (l.pos === 'noun' && l.gender) {
    const gs = genderOptions(u);
    return gs.length >= 2 && gs.includes(l.gender);
  }
  return false;
}

/** Accepted spellings for English→Latin recall: the first citation form (+ "or X" variants). */
export function recallAnswers(l: Lemma): string[] {
  const out = [l.parts[0] ?? l.headword];
  const m = l.headword.match(/\(or ([^)]+)\)/);
  if (m) out.push(m[1]!.trim());
  return out;
}

function nominativeHint(l: Lemma): string {
  if (l.pos === 'noun') return l.number === 'pl' ? 'nominative plural' : 'nominative';
  if (l.pos === 'adj') return l.number === 'pl' ? 'masculine nominative plural' : 'masculine nominative';
  if (l.pos === 'verb') return '“I” form';
  return '';
}

function genderNote(l: Lemma): string {
  const g = l.gender as Gender;
  const base = `${l.parts[0]} is ${genderName(g)}.`;
  if (l.paradigm === 'n1' && g === 'm') return `${base} Most 1st-declension nouns are feminine, but words for men’s roles, like nauta and poēta, are masculine.`;
  if (l.paradigm === 'n2m' && g === 'm') return `${base} 2nd-declension nouns in -us, -er and -ir are usually masculine.`;
  if (l.paradigm === 'n2n') return `${base} 2nd-declension nouns in -um are neuter.`;
  return base;
}

/** Senses of a gloss: split on , ; and drop "to", articles and parentheses. */
function senses(g: string): string[] {
  return g.toLowerCase().replace(/\([^)]*\)/g, '').split(/[,;]/)
    .map((s) => s.replace(/^\s*(to|a|an|the|pl\.)\s+/g, '').replace(/^\s*(be)\s+/, 'be ').trim())
    .filter(Boolean);
}
/** True if two glosses share a sense (e.g. "to preserve, save" vs "to preserve, conserve"). */
export function glossOverlap(a: string, b: string): boolean {
  if (glossKey(a) === glossKey(b)) return true;
  const sb = new Set(senses(b));
  return senses(a).some((s) => sb.has(s));
}

/* ---------------- lesson builders per node kind ---------------- */

export function buildLesson(node: PathNode, ctx: BuildCtx): Exercise[] {
  const known = new Set<string>([...ctx.path.knownAt(node.id), ...ctx.state.seen]);
  const f = new Factory(ctx, known);
  switch (node.kind) {
    case 'verba': case 'dcc': return newWordsLesson(node, f, ctx);
    case 'pattern': return [f.grammar(node.section), ...formsLesson(node, f, ctx, LESSON_SIZE - 1, true)];
    case 'formae': return formsLesson(node, f, ctx, LESSON_SIZE - 1, false);
    case 'repetitio': return reviewLesson(f, ctx, known, REVIEW_SIZE);
    case 'probatio': return probatio(f, ctx, PROBATIO_SIZE);
  }
}

function newWordsLesson(node: PathNode, f: Factory, ctx: BuildCtx): Exercise[] {
  const ws = node.newWords;
  const out: Exercise[] = [];
  // intro 1, intro 2, meaning 1, intro 3, meaning 2, … : each word is quizzed one step after it appears.
  ws.forEach((w, i) => {
    out.push(f.intro(w));
    if (i > 0) out.push(f.meaning(ws[i - 1]!));
  });
  if (ws.length) out.push(f.meaning(ws[ws.length - 1]!));
  // Fill to LESSON_SIZE: class questions on the new words, then due reviews.
  for (const w of ws) {
    if (out.length >= LESSON_SIZE) break;
    const k = f.klass(w);
    if (k) out.push(k);
  }
  if (out.length < LESSON_SIZE) {
    const exclude = new Set(ws);
    for (const card of dueCards(ctx, f.known)) {
      if (out.length >= LESSON_SIZE) break;
      const p = parseCardId(card);
      if (!p || exclude.has(p.lemma)) continue;
      const e = f.forCard(card);
      if (e) { out.push(e); exclude.add(p.lemma); }
    }
  }
  return out;
}

/** Drill words for pattern / Fōrmae nodes: the chapter's words first, then other known words with the feature. */
function drillWords(node: PathNode, f: Factory, ctx: BuildCtx): { id: string; feats: FeatureId[] }[] {
  const out: { id: string; feats: FeatureId[] }[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (seen.has(id) || !f.known.has(id)) return;
    const l = f.lemma(id);
    const feats = node.focus.filter((ft) => f.cells(l, [ft]).length > 0);
    if (feats.length) { out.push({ id, feats }); seen.add(id); }
  };
  node.drill.forEach(add);
  ctx.lex.words.forEach((w) => add(w.lemma.id));
  return out;
}

function formsLesson(node: PathNode, f: Factory, ctx: BuildCtx, size: number, recognitionFirst: boolean): Exercise[] {
  const words = drillWords(node, f, ctx);
  const out: Exercise[] = [];
  if (words.length === 0) return reviewLesson(f, ctx, f.known, size);
  // Chapter words lead; cycle through them so each gets drilled.
  const primary = words.slice(0, Math.max(4, Math.min(words.length, 8)));
  let i = 0;
  let guard = 0;
  while (out.length < size && guard++ < size * 6) {
    const w = primary[i % primary.length]!;
    const feat = w.feats[Math.floor(i / primary.length) % w.feats.length]!;
    const preferParse = recognitionFirst ? out.length < Math.ceil(size / 2) || out.length % 2 === 0 : out.length % 2 === 0;
    const e = f.forms(w.id, feat, preferParse);
    i++;
    if (!e) continue;
    if (e.type !== 'grammar' && e.type !== 'intro' && out.some((o) => isGraded(o) && o.cue === e.cue && o.prompt === e.prompt)) continue;
    out.push(e);
  }
  return out;
}

/** Due card ids among known words, lowest retrievability first. */
export function dueCards(ctx: BuildCtx, known: ReadonlySet<string>): string[] {
  const due: { id: string; r: number }[] = [];
  for (const [id, card] of ctx.state.cards) {
    const p = parseCardId(id);
    if (!p || !known.has(p.lemma) || !ctx.lex.byId.has(p.lemma)) continue;
    if (p.kind === 'forms' && !hasFeature(ctx.unlocked, p.feature as FeatureId)) continue;
    if (isDue(card, ctx.now)) due.push({ id, r: retrievability(card, ctx.now) });
  }
  return due.sort((a, b) => a.r - b.r || (a.id < b.id ? -1 : 1)).map((x) => x.id);
}

/** Recently missed card ids (last first-attempt grade was Again), most recent first. */
export function recentMisses(ctx: BuildCtx, known: ReadonlySet<string>): string[] {
  return [...ctx.state.last.entries()]
    .filter(([id, v]) => v.grade === 'again' && known.has(parseCardId(id)?.lemma ?? ''))
    .sort((a, b) => b[1].ts - a[1].ts || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);
}

/** Card ids for a Repetītiō: due by lowest retrievability, topped up with recent misses, then new card kinds. */
export function reviewCardIds(ctx: BuildCtx, known: ReadonlySet<string>, size: number): string[] {
  const chosen: string[] = [];
  const lemmaCount = new Map<string, number>();
  const add = (id: string): boolean => {
    if (chosen.length >= size || chosen.includes(id)) return false;
    const p = parseCardId(id);
    if (!p) return false;
    if ((lemmaCount.get(p.lemma) ?? 0) >= 2) return false;
    chosen.push(id);
    lemmaCount.set(p.lemma, (lemmaCount.get(p.lemma) ?? 0) + 1);
    return true;
  };
  const due = dueCards(ctx, known);
  const misses = recentMisses(ctx, known);
  const reserve = Math.min(4, misses.length);
  for (const id of due) { if (chosen.length >= size - reserve) break; add(id); }
  for (const id of misses) add(id);
  for (const id of due) add(id);
  // New card kinds for known words: recall (after 2 good meaning reviews), class, forms.
  const knownSorted = shuffle([...known].filter((id) => ctx.lex.byId.has(id)).sort(), rng(hashSeed(ctx.seed + ':pool')));
  for (const id of knownSorted) {
    if ((ctx.state.meaningGood.get(id) ?? 0) >= MIN_MEANING_FOR_RECALL && !ctx.state.cards.has(cardId(id, 'recall'))) add(cardId(id, 'recall'));
  }
  // Not-yet-due cards with the lowest retrievability.
  const rest = [...ctx.state.cards.entries()]
    .filter(([id]) => !chosen.includes(id) && known.has(parseCardId(id)?.lemma ?? ''))
    .map(([id, c]) => ({ id, r: retrievability(c, ctx.now) }))
    .sort((a, b) => a.r - b.r || (a.id < b.id ? -1 : 1));
  // Interleave: an unseen class card, then a low-retrievability card, then a meaning card…
  const classNew = knownSorted
    .filter((id) => !ctx.state.cards.has(cardId(id, 'class')) && hasClassQuestion(ctx.lex.byId.get(id)!.lemma, ctx.unlocked))
    .map((id) => cardId(id, 'class'));
  const meaningAll = knownSorted.map((id) => cardId(id, 'meaning'));
  for (let i = 0; chosen.length < size && (i < classNew.length || i < rest.length || i < meaningAll.length); i++) {
    if (classNew[i]) add(classNew[i]!);
    if (rest[i]) add(rest[i]!.id);
    if (meaningAll[i]) add(meaningAll[i]!);
  }
  return chosen;
}

function reviewLesson(f: Factory, ctx: BuildCtx, known: ReadonlySet<string>, size: number): Exercise[] {
  const ids = reviewCardIds(ctx, known, size + 6);
  const out: Exercise[] = [];
  for (const id of ids) {
    if (out.length >= size) break;
    const e = f.forCard(id);
    if (e) out.push(e);
  }
  // Spread the same lemma apart.
  return spread(shuffle(out, f.r));
}

function probatio(f: Factory, ctx: BuildCtx, size: number): Exercise[] {
  const sections = ctx.path.sections;
  const per = Math.ceil(size / sections.length);
  const out: Exercise[] = [];
  for (const sec of sections) {
    const words = shuffle(sec.nodes.flatMap((n) => n.newWords).filter((id) => f.known.has(id)), f.r);
    const kinds = ['meaning', 'forms', 'class', 'recall', 'forms', 'meaning'] as const;
    let k = 0;
    for (let wi = 0; wi < words.length && out.filter((e) => isGraded(e) && sectionOf(ctx, e.lemma) === sec.spec.n).length < per; wi++) {
      const id = words[wi]!;
      const kind = kinds[k % kinds.length]!;
      let e: Exercise | null = null;
      if (kind === 'meaning') e = f.meaning(id);
      else if (kind === 'recall') e = (ctx.state.meaningGood.get(id) ?? 0) >= MIN_MEANING_FOR_RECALL ? f.recall(id) : f.meaning(id);
      else if (kind === 'class') e = f.klass(id);
      else {
        const l = f.lemma(id);
        const feats = [...new Set(f.cells(l).map((c) => featureOfCell(l, c)).filter((x): x is FeatureId => x !== null))];
        const ft = pick(feats, f.r);
        e = ft ? f.forms(id, ft, k % 2 === 0) : null;
      }
      if (e) { out.push(e); k++; }
    }
  }
  return spread(out.slice(0, size));
}

function sectionOf(ctx: BuildCtx, lemma: string): number | null {
  for (const s of ctx.path.sections) if (s.nodes.some((n) => n.newWords.includes(lemma))) return s.spec.n;
  return null;
}

/** Reorder so the same lemma doesn't appear twice in a row where avoidable. */
function spread(xs: Exercise[]): Exercise[] {
  const out: Exercise[] = [];
  const pool = [...xs];
  while (pool.length) {
    const last = out[out.length - 1];
    const lastLemma = last && 'lemma' in last ? last.lemma : null;
    const i = pool.findIndex((e) => !('lemma' in e) || e.lemma !== lastLemma);
    out.push(pool.splice(i === -1 ? 0 : i, 1)[0]!);
  }
  return out;
}
