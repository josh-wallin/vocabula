/**
 * The learning path: one continuous sequence of nodes, grouped in sections
 * (one per Wheelock chapter). Built deterministically from the lexicon, so
 * node ids are stable and progress can be derived from `node_done` events.
 */
import type { Lexicon, Word } from './lexicon.ts';
import {
  SECTIONS, featuresAt, featuresNeeded, firstEligibleSection, hasFeature, roman,
  type FeatureId, type SectionSpec,
} from './curriculum.ts';

export type NodeKind = 'verba' | 'pattern' | 'repetitio' | 'formae' | 'dcc' | 'probatio';

export interface PathNode {
  id: string;
  section: number;
  kind: NodeKind;
  title: string;
  /** Lemma ids introduced by this node (verba / dcc). */
  newWords: string[];
  /** Features usable in this node's exercises. */
  unlocked: FeatureId[];
  /** Pattern / Fōrmae: the section's new paradigm features. */
  focus: FeatureId[];
  /** Pattern / Fōrmae: the chapter's lemma ids to drill. */
  drill: string[];
}

export interface Section { spec: SectionSpec; nodes: PathNode[] }

export interface Path {
  sections: Section[];
  nodes: PathNode[];
  index: Map<string, number>;
  /** Lemma ids known by the time each node starts (inclusive of its own new words). */
  knownAt(nodeId: string): string[];
}

export const MAX_VERBA = 6;
export const MAX_DCC_PER_SECTION = 12;
export const DCC_LESSON_SIZE = 6;
/** Insert a Repetītiō after this many lessons in a row. */
export const REVIEW_EVERY = 3;

/** Split n items into lessons of at most `max` words, as even as possible. */
export function splitEven<T>(items: readonly T[], max: number): T[][] {
  if (items.length === 0) return [];
  const k = Math.ceil(items.length / max);
  const out: T[][] = [];
  let i = 0;
  for (let j = 0; j < k; j++) {
    const size = Math.floor(items.length / k) + (j < items.length % k ? 1 : 0);
    out.push(items.slice(i, i + size));
    i += size;
  }
  return out;
}

const ord = (w: Word): number => w.lemma.sources[0]?.order ?? 0;

/** DCC words to add in each section (up to 12, by frequency; surplus carries forward). */
export function dccBySection(lex: Lexicon): Map<number, Word[]> {
  const out = new Map<number, Word[]>();
  const taken = new Set<string>();
  const eligibleAt = new Map<string, number | null>();
  for (const w of lex.dccOnly) eligibleAt.set(w.lemma.id, firstEligibleSection(featuresNeeded(w.lemma)));
  for (const s of SECTIONS) {
    const pick: Word[] = [];
    for (const w of lex.dccOnly) {
      if (pick.length >= MAX_DCC_PER_SECTION) break;
      const e = eligibleAt.get(w.lemma.id);
      if (e === null || e === undefined || e > s.n || taken.has(w.lemma.id)) continue;
      pick.push(w);
      taken.add(w.lemma.id);
    }
    out.set(s.n, pick);
  }
  return out;
}

export function buildPath(lex: Lexicon): Path {
  const sections: Section[] = [];
  const dcc = dccBySection(lex);
  for (const spec of SECTIONS) {
    const before = [...featuresAt(spec.n, false)];
    const after = [...featuresAt(spec.n, true)];
    const chapterWords = lex.words
      .filter((w) => w.origin === 'wheelock' && w.chapter === spec.chapter)
      .sort((a, b) => {
        const la = spec.leadParadigms.includes(a.lemma.paradigm) ? 0 : 1;
        const lb = spec.leadParadigms.includes(b.lemma.paradigm) ? 0 : 1;
        return la - lb || ord(a) - ord(b);
      });
    const verba = splitEven(chapterWords, MAX_VERBA);
    const s = `s${spec.n}`;
    const earlier = lex.words.filter((w) => w.origin === 'wheelock' && (w.chapter ?? 99) < spec.chapter);
    const drill = [...chapterWords, ...earlier]
      .filter((w) => spec.paradigm.some((f) => wordHasFeature(w, f)))
      .map((w) => w.lemma.id);

    // Core sequence: Verba I, pattern, Verba II…, Fōrmae, Plūra verba…
    const core: PathNode[] = [];
    let patternPlaced = false;
    verba.forEach((ws, i) => {
      core.push({
        id: `${s}.verba.${i + 1}`, section: spec.n, kind: 'verba', title: `Verba ${roman(i + 1)}`,
        newWords: ws.map((w) => w.lemma.id), unlocked: patternPlaced ? after : before, focus: [], drill: [],
      });
      if (i === 0) {
        core.push(patternNode(spec, after, drill));
        patternPlaced = true;
      }
    });
    if (!patternPlaced) core.push(patternNode(spec, after, drill));
    core.push({
      id: `${s}.formae`, section: spec.n, kind: 'formae', title: 'Fōrmae',
      newWords: [], unlocked: after, focus: spec.paradigm, drill,
    });
    const dccLessons = splitEven(dcc.get(spec.n) ?? [], DCC_LESSON_SIZE);
    dccLessons.forEach((ws, i) => {
      core.push({
        id: `${s}.dcc.${i + 1}`, section: spec.n, kind: 'dcc',
        title: dccLessons.length > 1 ? `Plūra verba ${roman(i + 1)}` : 'Plūra verba',
        newWords: ws.map((w) => w.lemma.id), unlocked: after, focus: [], drill: [],
      });
    });

    // Interleave Repetītiō after every REVIEW_EVERY lessons, and close the section with one.
    const nodes: PathNode[] = [];
    let run = 0;
    let reps = 0;
    const rep = (): PathNode => ({
      id: `${s}.rep.${++reps}`, section: spec.n, kind: 'repetitio', title: 'Repetītiō',
      newWords: [], unlocked: after, focus: [], drill: [],
    });
    core.forEach((n, i) => {
      nodes.push(n);
      run++;
      const remaining = core.length - i - 1;
      if (run >= REVIEW_EVERY && remaining >= 2) {
        const r = rep();
        r.unlocked = n.unlocked;
        nodes.push(r);
        run = 0;
      }
    });
    nodes.push(rep());
    if (spec.n === SECTIONS[SECTIONS.length - 1]!.n) {
      nodes.push({
        id: `${s}.probatio`, section: spec.n, kind: 'probatio', title: 'Probātiō',
        newWords: [], unlocked: after, focus: [], drill: [],
      });
    }
    sections.push({ spec, nodes });
  }

  const nodes = sections.flatMap((x) => x.nodes);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const knownPrefix: string[][] = [];
  const acc: string[] = [];
  for (const n of nodes) {
    acc.push(...n.newWords);
    knownPrefix.push([...acc]);
  }
  return {
    sections, nodes, index,
    knownAt(id: string) {
      const i = index.get(id);
      return i === undefined ? [] : knownPrefix[i]!;
    },
  };
}

function patternNode(spec: SectionSpec, unlocked: FeatureId[], drill: string[]): PathNode {
  return {
    id: `s${spec.n}.pattern`, section: spec.n, kind: 'pattern',
    title: `${spec.patternKind === 'coniugatio' ? 'Coniugātiō' : 'Dēclīnātiō'} ${roman(spec.n)}`,
    newWords: [], unlocked, focus: spec.paradigm, drill,
  };
}

function wordHasFeature(w: Word, f: FeatureId): boolean {
  const p = w.lemma.paradigm;
  switch (f) {
    case 'v12.ind': case 'v12.inf': case 'v12.imp': return p === 'v1' || p === 'v2';
    case 'n1': case 'n2m': case 'n2n': return p === f;
    case 'adj.m': case 'adj.f': case 'adj.n': return p === 'adj12';
    case 'sum.3sg': case 'sum.pres': return p === 'irr:sum';
    default: return false;
  }
}

/** Current node: the first one not completed. */
export function currentNodeIndex(path: Path, done: ReadonlySet<string>): number {
  const i = path.nodes.findIndex((n) => !done.has(n.id));
  return i === -1 ? path.nodes.length : i;
}

export const isUnlocked = (path: Path, done: ReadonlySet<string>, id: string): boolean =>
  (path.index.get(id) ?? Infinity) <= currentNodeIndex(path, done);

export { hasFeature };
