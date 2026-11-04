/**
 * Curriculum: which grammatical features each section unlocks, and which
 * feature a given (lemma, cell) needs. Pure data + functions.
 *
 * Two kinds of feature:
 *  - lexical features (conjugation class, gender options) unlock when a section starts;
 *  - paradigm features (endings) unlock at that section's Dēclīnātiō/Coniugātiō node.
 */
import type { CellId, Gender, Lemma, ParadigmId } from '../morph/types.ts';

export type FeatureId =
  | 'conj'          // tell 1st from 2nd conjugation
  | 'gender.mf'     // masculine / feminine
  | 'gender.n'      // neuter
  | 'v12.ind' | 'v12.inf' | 'v12.imp'
  | 'n1' | 'n2m' | 'n2n'
  | 'adj.f' | 'adj.m' | 'adj.n'
  | 'sum.3sg' | 'sum.pres';

export interface SectionSpec {
  n: number;
  chapter: number;
  title: string;
  /** Lexical features available from the start of the section. */
  lexical: FeatureId[];
  /** Paradigm features unlocked by the section's pattern node. */
  paradigm: FeatureId[];
  /** Paradigms whose new words lead the section's Verba lessons. */
  leadParadigms: ParadigmId[];
  patternKind: 'coniugatio' | 'declinatio';
  patternTitle: string;
}

export const SECTIONS: readonly SectionSpec[] = [
  {
    n: 1, chapter: 1, title: 'Present-tense verbs', lexical: ['conj'],
    paradigm: ['v12.ind', 'v12.inf', 'v12.imp'], leadParadigms: ['v1', 'v2'],
    patternKind: 'coniugatio', patternTitle: '1st & 2nd conjugation: present',
  },
  {
    n: 2, chapter: 2, title: 'First declension', lexical: ['gender.mf'],
    paradigm: ['n1', 'adj.f', 'sum.3sg'], leadParadigms: ['n1'],
    patternKind: 'declinatio', patternTitle: 'First declension',
  },
  {
    n: 3, chapter: 3, title: 'Second declension', lexical: [],
    paradigm: ['n2m', 'adj.m'], leadParadigms: ['n2m'],
    patternKind: 'declinatio', patternTitle: 'Second declension: masculine',
  },
  {
    n: 4, chapter: 4, title: 'Neuters and sum', lexical: ['gender.n'],
    paradigm: ['n2n', 'adj.n', 'sum.pres'], leadParadigms: ['n2n'],
    patternKind: 'declinatio', patternTitle: 'Second declension: neuter',
  },
];

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;
export const roman = (n: number): string => ROMAN[n] ?? String(n);

/** Features unlocked once section `n` has started (lexical) and, if `patternDone`, its paradigm features. */
export function featuresAt(n: number, patternReached: boolean): Set<FeatureId> {
  const out = new Set<FeatureId>();
  for (const s of SECTIONS) {
    if (s.n < n || (s.n === n && patternReached)) s.paradigm.forEach((f) => out.add(f));
    if (s.n <= n) s.lexical.forEach((f) => out.add(f));
  }
  return out;
}

/** Feature needed to drill a given cell of a lemma, or null if the cell is never drilled. */
export function featureOfCell(l: Lemma, cell: CellId): FeatureId | null {
  switch (l.paradigm) {
    case 'v1': case 'v2':
      if (cell.startsWith('pres.act.ind.')) return 'v12.ind';
      if (cell === 'pres.act.inf') return 'v12.inf';
      if (cell.startsWith('pres.act.imp.')) return 'v12.imp';
      return null;
    case 'n1': return 'n1';
    case 'n2m': return 'n2m';
    case 'n2n': return 'n2n';
    case 'adj12': {
      const g = cell.split('.')[2] as Gender | undefined;
      return g ? (`adj.${g}` as FeatureId) : null;
    }
    case 'irr:sum':
      return cell === 'pres.act.ind.3sg' ? 'sum.3sg' : cell.startsWith('pres.act.') ? 'sum.pres' : null;
    case 'indecl': return null;
  }
}

/** True if a feature is satisfied by the unlocked set ('sum.3sg' is also covered by 'sum.pres'). */
export function hasFeature(unlocked: ReadonlySet<FeatureId>, f: FeatureId): boolean {
  return unlocked.has(f) || (f === 'sum.3sg' && unlocked.has('sum.pres'));
}

/** Genders a gender question may offer. */
export function genderOptions(unlocked: ReadonlySet<FeatureId>): Gender[] {
  const out: Gender[] = [];
  if (unlocked.has('gender.mf')) out.push('m', 'f');
  if (unlocked.has('gender.n')) out.push('n');
  return out;
}

/**
 * Every feature a word needs before it can be taught as a new word.
 * Used for DCC eligibility: a DCC word enters the path in the first section
 * where all of these are unlocked.
 */
export function featuresNeeded(l: Lemma): FeatureId[] {
  const g: FeatureId[] = l.gender === 'n' ? ['gender.n'] : l.gender ? ['gender.mf'] : [];
  switch (l.paradigm) {
    case 'v1': case 'v2': return ['conj', 'v12.ind', 'v12.inf', 'v12.imp'];
    case 'n1': return ['n1', ...g];
    case 'n2m': return ['n2m', ...g];
    case 'n2n': return ['n2n', ...g];
    case 'adj12': return ['adj.m', 'adj.f', 'adj.n'];
    case 'irr:sum': return ['sum.pres'];
    case 'indecl': return g;
  }
}

/** Section number (1-based) in which all of `needed` are unlocked after the pattern node, or null. */
export function firstEligibleSection(needed: readonly FeatureId[]): number | null {
  for (const s of SECTIONS) {
    const have = featuresAt(s.n, true);
    if (needed.every((f) => hasFeature(have, f))) return s.n;
  }
  return null;
}
