/**
 * Lesson builder: turns a path node + the learner's derived state into an
 * ordered list of exercises. Deterministic for a given seed.
 */
import type { CellId, Gender, Lemma } from '../morph/types.ts';
import { generate } from '../morph/generate.ts';
import { analyze } from '../morph/analyze.ts';
import { featureOfCell, featuresNeeded, genderOptions, hasFeature, type FeatureId } from './curriculum.ts';
import { citation, classNote, glossKey, type Lexicon } from './lexicon.ts';
import { currentNodeIndex, type Path, type PathNode } from './path.ts';
import type { DerivedState } from './events.ts';
import { cardId, isDue, parseCardId, retrievability } from './srs.ts';
import { cellPrompt, genderName, optionLabeler } from './labels.ts';
import { hashSeed, pick, rng, shuffle, type Rng } from './util.ts';
import {
  buildListeningSentence, buildSentenceExercise, chooseSentences, sentenceCard, sentenceEligible,
  type Sentence, type SentenceExercise, type SentListenType,
} from './sentences.ts';
import { sentenceAudio, wordAudio, wordText, type AudioRef } from '../audio/items.ts';
import { buildAuditio, type AuditScreen, type ListeningLesson } from './listening.ts';
import { buildLectio, type Lectio, type LectioScreen } from './lectio.ts';

export interface Option { id: string; text: string; la?: boolean }

export type Exercise =
  | { id: string; type: 'grammar'; kind: 'grammar'; section: number }
  | { id: string; type: 'intro'; kind: 'intro'; lemma: string }
  | {
      /**
       * listen: hear the word, choose its meaning (the cue is shown only after answering).
       * audit-word / audit-q: Audītiō pre-teach quiz / comprehension question (lemma: vocab id / '').
       * lectio-q: Lectiō comprehension question (lemma '').
       */
      id: string; type: 'choice'; kind: 'meaning' | 'gender' | 'conj' | 'parse' | 'listen' | 'audit-word' | 'audit-q' | 'lectio-q';
      lemma: string; card: string; prompt: string; cue: string; cueLa: boolean;
      options: Option[]; answer: string[]; multi: boolean; note: string;
      audio?: AudioRef; fallback?: Exercise;
    }
  | {
      /** dictate: hear the word, type it (macrons optional, as for recall). */
      id: string; type: 'typed'; kind: 'recall' | 'produce' | 'dictate';
      lemma: string; card: string; prompt: string; cue: string; cueLa: boolean; hint: string;
      accepted: string[]; note: string;
      audio?: AudioRef; fallback?: Exercise;
    }
  | SentenceExercise
  | AuditScreen
  | LectioScreen;

export type ChoiceExercise = Extract<Exercise, { type: 'choice' }>;
export type TypedExercise = Extract<Exercise, { type: 'typed' }>;
export type GradedExercise = ChoiceExercise | TypedExercise;
export const isGraded = (e: Exercise): e is GradedExercise => e.type === 'choice' || e.type === 'typed';
export const isSentence = (e: Exercise): e is SentenceExercise => e.type === 'sentence';
/** Exercises that are answered and graded (word exercises and sentence exercises). */
export const isScored = (e: Exercise): e is GradedExercise | SentenceExercise => isGraded(e) || isSentence(e);
/** A listening exercise: it plays a clip, and has a non-audio fallback for when the clip can't be played. */
export const isListening = (e: Exercise): e is (GradedExercise | SentenceExercise) & { audio: AudioRef; fallback: Exercise } =>
  (isGraded(e) || isSentence(e)) && !!e.audio && !!e.fallback;

export const LESSON_SIZE = 12;
export const REVIEW_SIZE = 13;
export const PROBATIO_SIZE = 20;
/** English → Latin typing unlocks after this many correct meaning answers (the first quiz in the word's own lesson counts). */
export const MIN_MEANING_FOR_RECALL = 1;
/** New-word lessons: at most this many English → Latin exercises on words from earlier lessons. */
export const RECALL_PER_NEW_WORDS_LESSON = 2;
/** Repetītiō: about this share of the word exercises are English → Latin typing (when enough words qualify). */
export const RECALL_SHARE_OF_REVIEW = 1 / 3;

export interface BuildCtx {
  lex: Lexicon;
  path: Path;
  state: DerivedState;
  now: Date;
  /** Features available to this lesson (the learner's frontier, which includes the node's own). */
  unlocked: ReadonlySet<FeatureId>;
  seed: string;
  /** Path index the lesson stands at (its node; for ad-hoc practice, the last finished node). */
  at?: number;
  /** Sentence bank for sentence exercises (none when absent). */
  sentences?: readonly Sentence[];
  /**
   * Listening exercises (none when absent): `available(clip)` says whether a clip is likely
   * playable now (online, or cached on this device, and not known to be missing).
   */
  listening?: { available: (clip: AudioRef) => boolean };
  /** Audītiō lesson definitions (content/listening), for `auditio` nodes. */
  auditio?: readonly ListeningLesson[];
  /** Lectiō passages (content/lectio), for `lectio` nodes. */
  lectio?: readonly Lectio[];
}

/** Listening cards: {lemma}:listen (hear → meaning), {lemma}:dictate (hear → type it). */
export type ListenKind = 'listen' | 'dictate';
export const listenCard = (lemma: string, kind: ListenKind): string => `${lemma}:${kind}`;
export function parseListenCard(card: string): { lemma: string; kind: ListenKind } | null {
  const m = /^([^:]+):(listen|dictate)$/.exec(card);
  return m && !card.startsWith('sent:') ? { lemma: m[1]!, kind: m[2] as ListenKind } : null;
}
/** A word may get listening exercises once it has this many correct meaning reviews. */
export const MIN_MEANING_FOR_LISTEN = 1;
/** Listening exercises per lesson (when the words / sentences and their clips are there). */
export const WORD_LISTENING_PER_LESSON = 2;
export const SENTENCE_LISTENING = { repetitio: 1, probatio: 2 } as const;

/** Sentence exercises per lesson kind (when enough sentences are eligible). */
export const SENTENCES_PER_REVIEW = { min: 2, max: 4 } as const;
export const SENTENCES_PER_FORMAE = { min: 2, max: 3 } as const;
export const SENTENCES_PER_PROBATIO = 6;

/**
 * Familia Rōmāna previews are meaning only. No class or forms exercises for:
 *  - FR-only words, ever;
 *  - a previewed Wheelock/DCC word before the main path has taught it, unless every feature
 *    its paradigm needs is already unlocked.
 */
export function formsLocked(ctx: BuildCtx, id: string): boolean {
  const w = ctx.lex.byId.get(id);
  if (!w) return false;
  if (w.origin === 'fr') return true;
  if (!w.fr) return false;
  const at = ctx.at ?? currentNodeIndex(ctx.path, ctx.state.done) - 1;
  const mi = ctx.path.mainIndex.get(id);
  if (mi !== undefined && mi <= at) return false;
  return !featuresNeeded(w.lemma).every((f) => hasFeature(ctx.unlocked, f));
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
    const hint = recallHint(l);
    const accepted = recallAccepted(l, this.ctx.lex);
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
    if (formsLocked(this.ctx, id)) return null; // FR previews: meaning only
    const ans = CONJ_OF[l.paradigm];
    if (ans && hasClassQuestion(l, u)) {
      const three = u.has('conj3');
      const four = u.has('conj4');
      const options = [{ id: '1', text: '1st conjugation' }, { id: '2', text: '2nd conjugation' }];
      if (three) options.push({ id: '3', text: '3rd conjugation' });
      // Wheelock ch. 10: -iō verbs are a kind of 3rd conjugation, told apart by the 1st person in -iō.
      if (four) options.push({ id: '3io', text: '3rd conjugation -iō' }, { id: '4', text: '4th conjugation' });
      const why = ans === '1' ? 'ā, so 1st conjugation' : ans === '2' ? 'ē, so 2nd conjugation' : ans === '4' ? 'ī, so 4th conjugation'
        : ans === '3io' ? `a short e, so 3rd conjugation; with ${l.parts[0]} in -iō it is a 3rd-conjugation -iō verb`
        : four ? `a short e and ${l.parts[0]} has no -iō, so plain 3rd conjugation` : 'a short e, so 3rd conjugation';
      return {
        id: this.nextId(), type: 'choice', kind: 'conj', lemma: id, card: cardId(id, 'class'),
        prompt: three ? 'Which conjugation?' : '1st or 2nd conjugation?', cue: citation(l), cueLa: true,
        options, answer: [ans], multi: false,
        note: `${l.parts[1]}: the vowel before -re is ${why}.`,
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
    if (formsLocked(this.ctx, l.id)) return []; // FR previews: no forms
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
    const label = optionLabeler(chosen);
    const opts = chosen.map((c) => ({ id: c, text: label(c) }));
    const multi = answerCells.length > 1;
    return {
      id: this.nextId(), type: 'choice', kind: 'parse', lemma: id, card: cardId(id, 'forms', f),
      prompt: multi ? 'Which forms could this be?' : 'Which form is this?', cue: form, cueLa: true,
      options: opts, answer: answerCells, multi,
      note: `${form} (${l.parts[0]}): ${answerCells.map(label).join('; ')}.`,
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

  /**
   * Up to `want` sentence exercises for a node: only sentences whose section is reached, whose words
   * are known and whose endings are unlocked. Uses its own RNG stream so word exercises are unaffected.
   */
  sentenceExercises(node: PathNode, want: number, focus?: readonly FeatureId[], exclude?: ReadonlySet<string>): SentenceExercise[] {
    const bank = this.ctx.sentences ?? [];
    if (!bank.length || want <= 0) return [];
    const r = rng(hashSeed(`${this.ctx.seed}:sentences`));
    const sctx = { lex: this.ctx.lex, known: this.known, unlocked: this.ctx.unlocked, section: node.section };
    const eligible = bank.filter((s) => sentenceEligible(s, sctx) && !exclude?.has(s.id));
    const picks = chooseSentences({ ...sctx, bank: eligible, state: this.ctx.state, now: this.ctx.now, count: want, rng: r, ...(focus ? { focus } : {}) });
    // English distractor tiles may come from any sentence of the sections reached.
    const pool = bank.filter((s) => s.section <= node.section);
    const out: SentenceExercise[] = [];
    for (const p of picks) {
      const e = buildSentenceExercise(p.s, p.type, { ...sctx, rng: r, nextId: () => this.nextId(), pool, ...(focus ? { focus } : {}) });
      if (e) out.push(e);
    }
    return out;
  }

  /** How many sentences are eligible for a node (to size its sentence share). */
  eligibleSentenceCount(node: PathNode): number {
    const sctx = { lex: this.ctx.lex, known: this.known, unlocked: this.ctx.unlocked, section: node.section };
    return (this.ctx.sentences ?? []).filter((s) => sentenceEligible(s, sctx)).length;
  }

  /** Hear the word, choose the meaning; falls back to the plain meaning question. */
  listenMeaning(id: string): Exercise {
    const base = this.meaning(id) as ChoiceExercise;
    return {
      ...base, id: this.nextId(), kind: 'listen', card: listenCard(id, 'listen'),
      prompt: 'What does this word mean?', audio: wordAudio(this.lemma(id)), fallback: base,
    };
  }

  /** Hear the word, type it; falls back to the plain meaning question. */
  dictate(id: string): Exercise {
    const l = this.lemma(id);
    const word = wordText(l);
    const fallback = this.meaning(id);
    return {
      id: this.nextId(), type: 'typed', kind: 'dictate', lemma: id, card: listenCard(id, 'dictate'),
      prompt: 'Type what you hear', cue: word, cueLa: true, hint: '',
      accepted: [word], note: `${citation(l)}${l.gender ? ` (${l.gender}.)` : ''}: ${l.gloss}.`,
      audio: wordAudio(l), fallback,
    };
  }

  /**
   * Up to `want` word listening exercises on words with ≥ MIN_MEANING_FOR_LISTEN correct meaning
   * reviews whose clip is available, one per word, none on `exclude`d words: due listening cards first
   * (lowest retrievability), then new ones (hear → meaning before dictation), then the weakest.
   * Own RNG stream, so the rest of the lesson doesn't depend on it.
   */
  wordListening(want: number, exclude: ReadonlySet<string>): Exercise[] {
    const L = this.ctx.listening;
    if (!L || want <= 0) return [];
    const r = rng(hashSeed(`${this.ctx.seed}:listen`));
    const st = this.ctx.state;
    const cands: { id: string; kind: ListenKind; tier: number; r: number; tie: number }[] = [];
    for (const id of [...this.known].sort()) {
      const w = this.ctx.lex.byId.get(id);
      if (!w || exclude.has(id) || (st.meaningGood.get(id) ?? 0) < MIN_MEANING_FOR_LISTEN) continue;
      if (!L.available(wordAudio(w.lemma))) continue;
      const listen = st.cards.get(listenCard(id, 'listen'));
      for (const kind of ['listen', 'dictate'] as const) {
        const card = st.cards.get(listenCard(id, kind));
        if (kind === 'dictate' && !listen) continue; // dictation only after a hear → meaning review
        const tier = !card ? (kind === 'listen' ? 1 : 2) : isDue(card, this.ctx.now) ? 0 : 3;
        cands.push({ id, kind, tier, r: card ? retrievability(card, this.ctx.now) : 0, tie: r() });
      }
    }
    cands.sort((a, b) => a.tier - b.tier || a.r - b.r || a.tie - b.tie);
    const out: Exercise[] = [];
    const used = new Set<string>();
    for (const c of cands) {
      if (out.length >= want) break;
      if (used.has(c.id)) continue;
      used.add(c.id);
      out.push(c.kind === 'listen' ? this.listenMeaning(c.id) : this.dictate(c.id));
    }
    return out;
  }

  /**
   * Up to `want` sentence listening exercises (eligible sentences with an available clip), one per
   * sentence: due cards first, then new (hear → English before dictation), then the weakest.
   */
  sentenceListening(node: PathNode, want: number): SentenceExercise[] {
    const L = this.ctx.listening;
    const bank = this.ctx.sentences ?? [];
    if (!L || !bank.length || want <= 0) return [];
    const r = rng(hashSeed(`${this.ctx.seed}:listen-sent`));
    const sctx = { lex: this.ctx.lex, known: this.known, unlocked: this.ctx.unlocked, section: node.section };
    const st = this.ctx.state;
    const cands: { s: Sentence; kind: SentListenType; tier: number; r: number; tie: number }[] = [];
    for (const s of bank) {
      if (!sentenceEligible(s, sctx) || !L.available(sentenceAudio(s))) continue;
      const listen = st.cards.get(sentenceCard(s.id, 'listen'));
      for (const kind of ['listen', 'dictate'] as const) {
        const card = st.cards.get(sentenceCard(s.id, kind));
        if (kind === 'dictate' && !listen) continue;
        const tier = !card ? (kind === 'listen' ? 1 : 2) : isDue(card, this.ctx.now) ? 0 : 3;
        cands.push({ s, kind, tier, r: card ? retrievability(card, this.ctx.now) : 0, tie: r() });
      }
    }
    cands.sort((a, b) => a.tier - b.tier || a.r - b.r || a.tie - b.tie);
    const pool = bank.filter((s) => s.section <= node.section);
    const out: SentenceExercise[] = [];
    for (const c of cands) {
      if (out.length >= want) break;
      if (out.some((e) => e.sentence === c.s.id)) continue;
      const e = buildListeningSentence(c.s, c.kind, { ...sctx, rng: r, nextId: () => this.nextId(), pool }, sentenceAudio(c.s));
      if (e) out.push(e);
    }
    return out;
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

/** Conjugation-question answer for the conjugations the curriculum asks about. */
const CONJ_OF: Partial<Record<Lemma['paradigm'], '1' | '2' | '3' | '3io' | '4'>> = { v1: '1', v2: '2', v3: '3', v3io: '3io', v4: '4' };

/** Whether a gender / conjugation question exists for a word with the unlocked features. */
export function hasClassQuestion(l: Lemma, u: ReadonlySet<FeatureId>): boolean {
  if (l.paradigm === 'v1' || l.paradigm === 'v2') return u.has('conj');
  if (l.paradigm === 'v3') return u.has('conj') && u.has('conj3');
  if (l.paradigm === 'v3io' || l.paradigm === 'v4') return u.has('conj') && u.has('conj3') && u.has('conj4');
  if (l.pos === 'noun' && l.gender) {
    const gs = genderOptions(u);
    return gs.length >= 2 && gs.includes(l.gender);
  }
  return false;
}

/**
 * Accepted spellings for English→Latin recall. The prompt asks for "the Latin word", and the
 * hint names the form (nominative, masculine nominative, “I” form), so a bare inflected form
 * such as the infinitive alone is not accepted. Accepted:
 * - the first citation form (listed first: it is the answer shown after a miss);
 * - variants printed in the headword: "iuvō (or adiuvō)", "ā (or ab)", "ex or ē";
 * - the citation written out: any run of the principal parts from the first ("amō, amāre",
 *   "amō, amāre, amāvī, amātum"; "rosa, rosae"; "magnus, magna, magnum"), optionally with the
 *   gender ("rosa, rosae, f."), or the headword exactly as printed;
 * - an enclitic without its hyphen ("que" for -que); a usage note dropped ("cum" for "cum + indic.").
 * Matching is case- and macron-insensitive (compareAnswer), so spacing after commas doesn't matter.
 */
export function recallAnswers(l: Lemma): string[] {
  const out: string[] = [];
  const add = (s: string | undefined) => {
    const t = (s ?? '').replace(/\s*\+.*$/, '').trim();
    if (t && !out.includes(t)) out.push(t);
  };
  const parts = l.parts.map((p) => p.replace(/\s*\+.*$/, '').trim()).filter(Boolean);
  // "ex or ē": each variant on its own, the first one first.
  const [first = l.headword, ...alts] = (parts[0] ?? l.headword).split(/\s+or\s+/);
  add(first);
  for (const v of alts) add(v);
  for (const m of l.headword.matchAll(/\(or ([^)]+)\)/g)) for (const v of m[1]!.split(/\s*(?:,|\bor\b)\s*/)) add(v);
  for (let k = 2; k <= parts.length; k++) {
    const c = parts.slice(0, k).join(', ');
    add(c);
    if (l.gender) add(`${c}, ${l.gender}.`);
  }
  if (!/\bor\b/.test(l.headword)) add(l.headword);
  if (first.startsWith('-')) add(first.slice(1));
  return out;
}

/**
 * Every answer a recall exercise accepts: the word's own (recallAnswers), then those of any other
 * word whose prompt reads exactly the same (same gloss and same hint: ex / ē and nimis / nimium,
 * which Wheelock prints as one entry; verbum / vocābulum), since the question as shown can't tell
 * them apart. Words that differ in class, gender or form (amīcus / amīca, timor / metus) don't count.
 */
export function recallAccepted(l: Lemma, lex: Pick<Lexicon, 'words'>): string[] {
  const gloss = glossKey(l.gloss);
  const hint = recallHint(l);
  const twins = lex.words.filter((w) => w.lemma.id !== l.id && glossKey(w.lemma.gloss) === gloss && recallHint(w.lemma) === hint);
  return [...new Set([...recallAnswers(l), ...twins.flatMap((w) => recallAnswers(w.lemma))])];
}

/** The hint under a recall cue: class, gender and which form to give. */
export function recallHint(l: Lemma): string {
  return [classNote(l), l.gender ? `${genderName(l.gender)}` : '', nominativeHint(l)].filter(Boolean).join(' · ');
}

function nominativeHint(l: Lemma): string {
  if (l.pos === 'noun') return l.number === 'pl' ? 'nominative plural' : 'nominative';
  if (l.pos === 'adj' || l.paradigm === 'pron:hic' || l.paradigm === 'pron:ille') return l.number === 'pl' ? 'masculine nominative plural' : 'masculine nominative';
  if (l.pos === 'verb') return '“I” form';
  return '';
}

function genderNote(l: Lemma): string {
  const g = l.gender as Gender;
  const base = `${l.parts[0]} is ${genderName(g)}.`;
  if (l.paradigm === 'n1' && g === 'm') return `${base} Most 1st-declension nouns are feminine, but words for men’s roles, like nauta and poēta, are masculine.`;
  if (l.paradigm === 'n2m' && g === 'm') return `${base} 2nd-declension nouns in -us, -er and -ir are usually masculine.`;
  if (l.paradigm === 'n2n') return `${base} 2nd-declension nouns in -um are neuter.`;
  if (l.paradigm.startsWith('n3')) return `${base} The 3rd declension has all three genders: learn each noun’s gender with it.`;
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

export function buildLesson(node: PathNode, base: BuildCtx): Exercise[] {
  const ctx: BuildCtx = { ...base, at: base.at ?? base.path.index.get(node.id) ?? currentNodeIndex(base.path, base.state.done) - 1 };
  const known = new Set<string>([...ctx.path.knownAt(node.id), ...ctx.state.seen]);
  const f = new Factory(ctx, known);
  switch (node.kind) {
    case 'verba': case 'dcc': return newWordsLesson(node, f, ctx);
    case 'fr': return newWordsLesson(node, f, ctx, true);
    case 'pattern': return [f.grammar(node.section), ...formsLesson(node, f, ctx, LESSON_SIZE - 1, true)];
    case 'formae': {
      const n = f.eligibleSentenceCount(node);
      const want = n === 0 ? 0 : n >= 6 ? SENTENCES_PER_FORMAE.max : SENTENCES_PER_FORMAE.min;
      return withSentences(f.sentenceExercises(node, want, node.focus), (k) => formsLesson(node, f, ctx, LESSON_SIZE - 1 - k, false));
    }
    case 'repetitio': {
      const n = f.eligibleSentenceCount(node);
      const want = n === 0 ? 0 : n >= 8 ? SENTENCES_PER_REVIEW.max : n >= 3 ? 3 : SENTENCES_PER_REVIEW.min;
      // Listening (only with ctx.listening): sentences first so the others avoid them; words kept out of the review part.
      const heard = f.sentenceListening(node, SENTENCE_LISTENING.repetitio);
      const sent = [...f.sentenceExercises(node, want, undefined, avoidHeard(heard, n, want)), ...heard];
      const listen = f.wordListening(WORD_LISTENING_PER_LESSON, new Set());
      const listenLemmas = new Set(listen.map((e) => ('lemma' in e ? e.lemma : '')));
      return withSentences(sent, (k) => mixIn(reviewLesson(f, ctx, known, REVIEW_SIZE - k - listen.length, listenLemmas), listen));
    }
    case 'probatio': {
      const want = f.eligibleSentenceCount(node) ? SENTENCES_PER_PROBATIO : 0;
      const heard = want ? f.sentenceListening(node, SENTENCE_LISTENING.probatio) : [];
      const sent = [...f.sentenceExercises(node, want, undefined, avoidHeard(heard, f.eligibleSentenceCount(node), want)), ...heard];
      return withSentences(sent, (k) => probatio(f, ctx, PROBATIO_SIZE - k));
    }
    case 'auditio': {
      const l = ctx.auditio?.find((x) => x.id === node.listening);
      if (!l) throw new Error(`no listening lesson ${node.listening ?? '?'} for ${node.id}`);
      return buildAuditio(l, ctx.seed);
    }
    case 'lectio': {
      const p = ctx.lectio?.find((x) => x.id === node.lectio);
      if (!p) throw new Error(`no Lectiō passage ${node.lectio ?? '?'} for ${node.id}`);
      return buildLectio(p, ctx.seed);
    }
  }
}

/**
 * Sentences the ordinary sentence exercises should leave out because a listening exercise uses
 * them, but only while enough other sentences remain (with few sentences, both may use one).
 */
function avoidHeard(heard: readonly SentenceExercise[], eligible: number, want: number): Set<string> | undefined {
  return heard.length && eligible - heard.length >= Math.min(want, 2) ? new Set(heard.map((e) => e.sentence)) : undefined;
}

/** Spread `extra` evenly through the second two thirds of `xs` (listening after some warm-up). */
function mixIn(xs: Exercise[], extra: Exercise[]): Exercise[] {
  if (!extra.length) return xs;
  const out = [...xs];
  const start = Math.ceil(out.length / 3);
  extra.forEach((e, i) => out.splice(Math.min(out.length, start + Math.round(((i + 1) * (out.length - start)) / (extra.length + 1)) + i), 0, e));
  return out;
}

/** Build the word part with room left for the sentences, then spread the sentences evenly through it. */
function withSentences(sent: SentenceExercise[], words: (k: number) => Exercise[]): Exercise[] {
  const out = words(sent.length);
  if (!sent.length) return out;
  const total = out.length + sent.length;
  sent.forEach((e, i) => out.splice(Math.min(out.length, Math.round(((i + 1) * total) / (sent.length + 1)) - 1), 0, e));
  return out;
}

/** New words: intro + meaning for each; `meaningOnly` (FR previews) skips the class questions. */
function newWordsLesson(node: PathNode, f: Factory, ctx: BuildCtx, meaningOnly = false): Exercise[] {
  const ws = node.newWords;
  // Listening on already-known words (not this lesson's): part of the fill, or extra when intros + quizzes fill the lesson.
  const listen = f.wordListening(WORD_LISTENING_PER_LESSON, new Set(ws));
  const fillTo = LESSON_SIZE - listen.length;
  const out: Exercise[] = [];
  // intro 1, intro 2, meaning 1, intro 3, meaning 2, … : each word is quizzed one step after it appears.
  ws.forEach((w, i) => {
    out.push(f.intro(w));
    if (i > 0) out.push(f.meaning(ws[i - 1]!));
  });
  if (ws.length) out.push(f.meaning(ws[ws.length - 1]!));
  // Fill to LESSON_SIZE: English → Latin on earlier words, class questions on the new words, then due reviews.
  const recalled = new Set<string>();
  for (const card of recallCandidates(ctx, f.known)) {
    if (recalled.size >= RECALL_PER_NEW_WORDS_LESSON || out.length >= fillTo) break;
    const id = parseCardId(card)!.lemma;
    if (ws.includes(id) || listen.some((e) => 'lemma' in e && e.lemma === id)) continue;
    out.push(f.recall(id));
    recalled.add(id);
  }
  for (const w of meaningOnly ? [] : ws) {
    if (out.length >= fillTo) break;
    const k = f.klass(w);
    if (k) out.push(k);
  }
  if (out.length < fillTo) {
    const exclude = new Set([...ws, ...recalled, ...listen.map((e) => ('lemma' in e ? e.lemma : ''))]);
    for (const card of dueCards(ctx, f.known)) {
      if (out.length >= fillTo) break;
      const p = parseCardId(card);
      if (!p || exclude.has(p.lemma)) continue;
      const e = f.forCard(card);
      if (e) { out.push(e); exclude.add(p.lemma); }
    }
  }
  return mixIn(out, listen);
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
  // Chapter words lead; make sure every focus feature has a word among the leads; cycle through them.
  const leads: typeof words = [];
  for (const ft of node.focus) {
    const w = words.find((x) => x.feats.includes(ft));
    if (w && !leads.includes(w)) leads.push(w);
  }
  for (const w of words) if (leads.length < 8 && !leads.includes(w)) leads.push(w);
  const order = words.filter((w) => leads.includes(w)); // keep chapter order
  const primary = order.slice(0, Math.max(4, Math.min(order.length, 8)));
  let i = 0;
  let guard = 0;
  while (out.length < size && guard++ < size * 6) {
    const w = primary[i % primary.length]!;
    const feat = w.feats[Math.floor(i / primary.length) % w.feats.length]!;
    const preferParse = recognitionFirst ? out.length < Math.ceil(size / 2) || out.length % 2 === 0 : out.length % 2 === 0;
    const e = f.forms(w.id, feat, preferParse);
    i++;
    if (!e) continue;
    if (isGraded(e) && out.some((o) => isGraded(o) && o.cue === e.cue && o.prompt === e.prompt)) continue;
    out.push(e);
  }
  return out;
}

/**
 * English → Latin cards to practise, best first: due recall cards (lowest retrievability first), then
 * new recall cards for known words with enough correct meaning answers (least recently learned first,
 * i.e. in path order, so older words get typed before newer ones).
 */
export function recallCandidates(ctx: BuildCtx, known: ReadonlySet<string>): string[] {
  const due = dueCards(ctx, known).filter((id) => parseCardId(id)?.kind === 'recall');
  const fresh: string[] = [];
  for (const w of ctx.lex.words) {
    const id = w.lemma.id;
    if (!known.has(id) || ctx.state.cards.has(cardId(id, 'recall'))) continue;
    if ((ctx.state.meaningGood.get(id) ?? 0) >= MIN_MEANING_FOR_RECALL) fresh.push(cardId(id, 'recall'));
  }
  return [...due, ...fresh];
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
export function reviewCardIds(ctx: BuildCtx, known: ReadonlySet<string>, size: number, lessonSize = size): string[] {
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
  // English → Latin typing: about a third of the review, due recall cards first, then new ones.
  const recall = recallCandidates(ctx, known);
  // lessonSize: how many exercises the caller will actually use (it asks for a few spare ids).
  const recallWant = Math.min(recall.length, Math.round(lessonSize * RECALL_SHARE_OF_REVIEW));
  // Recall first: callers build exercises from the front of this list and may stop early.
  for (const id of recall) { if (chosen.length >= recallWant) break; add(id); }
  for (const id of due) { if (chosen.length >= size - reserve) break; add(id); }
  for (const id of misses) add(id);
  for (const id of due) add(id);
  // New card kinds for known words: recall (after a correct meaning answer), class, forms.
  const knownSorted = shuffle([...known].filter((id) => ctx.lex.byId.has(id)).sort(), rng(hashSeed(ctx.seed + ':pool')));
  for (const id of recall) add(id);
  // Not-yet-due cards with the lowest retrievability.
  const rest = [...ctx.state.cards.entries()]
    .filter(([id]) => !chosen.includes(id) && known.has(parseCardId(id)?.lemma ?? ''))
    .map(([id, c]) => ({ id, r: retrievability(c, ctx.now) }))
    .sort((a, b) => a.r - b.r || (a.id < b.id ? -1 : 1));
  // Interleave: an unseen class card, then a low-retrievability card, then a meaning card…
  const classNew = knownSorted
    .filter((id) => !ctx.state.cards.has(cardId(id, 'class')) && !formsLocked(ctx, id) && hasClassQuestion(ctx.lex.byId.get(id)!.lemma, ctx.unlocked))
    .map((id) => cardId(id, 'class'));
  const meaningAll = knownSorted.map((id) => cardId(id, 'meaning'));
  for (let i = 0; chosen.length < size && (i < classNew.length || i < rest.length || i < meaningAll.length); i++) {
    if (classNew[i]) add(classNew[i]!);
    if (rest[i]) add(rest[i]!.id);
    if (meaningAll[i]) add(meaningAll[i]!);
  }
  return chosen;
}

function reviewLesson(f: Factory, ctx: BuildCtx, known: ReadonlySet<string>, size: number, exclude?: ReadonlySet<string>): Exercise[] {
  const ids = reviewCardIds(ctx, known, size + 6 + (exclude?.size ? 2 * exclude.size : 0), size);
  const out: Exercise[] = [];
  for (const id of ids) {
    if (out.length >= size) break;
    if (exclude?.size && exclude.has(parseCardId(id)?.lemma ?? '')) continue;
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
    const kinds = ['meaning', 'recall', 'forms', 'class', 'recall', 'forms'] as const;
    let k = 0;
    for (let wi = 0; wi < words.length && out.filter((e) => isGraded(e) && sectionOf(ctx, e.lemma) === sec.spec.n).length < per; wi++) {
      const id = words[wi]!;
      const kind = kinds[k % kinds.length]!;
      let e: Exercise | null = null;
      if (kind === 'meaning') e = f.meaning(id);
      else if (kind === 'recall') e = (ctx.state.meaningGood.get(id) ?? 0) >= MIN_MEANING_FOR_RECALL ? f.recall(id) : f.meaning(id);
      // No class question for this word (or no forms below): don't waste it, ask its meaning instead.
      else if (kind === 'class') e = f.klass(id) ?? f.meaning(id);
      else {
        const l = f.lemma(id);
        const feats = [...new Set(f.cells(l).map((c) => featureOfCell(l, c)).filter((x): x is FeatureId => x !== null))];
        const ft = pick(feats, f.r);
        e = (ft ? f.forms(id, ft, k % 2 === 0) : null) ?? f.meaning(id);
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
