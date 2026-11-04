/**
 * Curriculum: which grammatical features each section unlocks, and which
 * feature a given (lemma, cell) needs. Pure data + functions.
 *
 * Two kinds of feature:
 *  - lexical features (conjugation class, gender options) unlock when a section starts;
 *  - paradigm features (endings) unlock at that section's Dēclīnātiō/Coniugātiō node.
 *
 * Sections 1–4 always exist. Sections 5–10 appear only when the content pack has
 * Wheelock words for their chapter (see activeSections in path.ts), so a pack
 * with only ch. 1–4 builds exactly the old path.
 */
import type { CellId, Gender, Lemma, ParadigmId } from '../morph/types.ts';
import { tenseOf } from '../morph/cells.ts';

export type FeatureId =
  | 'conj'          // tell 1st from 2nd conjugation
  | 'conj3'         // … and from 3rd (section 8)
  | 'conj4'         // … and 3rd -iō and 4th (section 10)
  | 'gender.mf'     // masculine / feminine
  | 'gender.n'      // neuter
  | 'v12.ind' | 'v12.inf' | 'v12.imp' | 'v12.fut' | 'v12.impf'
  | 'v3.ind' | 'v3.inf' | 'v3.imp' | 'v3.fut' | 'v3.impf'
  // Wheelock ch. 10: 3rd -iō and 4th conjugation.
  | 'v3io.ind' | 'v3io.inf' | 'v3io.imp' | 'v3io.fut' | 'v3io.impf'
  | 'v4.ind' | 'v4.inf' | 'v4.imp' | 'v4.fut' | 'v4.impf'
  // Wheelock ch. 14 (i-stems): generated, but no section unlocks them yet.
  | 'n1' | 'n2m' | 'n2n' | 'n3' | 'n3n' | 'n3i' | 'n3in'
  | 'adj.f' | 'adj.m' | 'adj.n'
  // Wheelock ch. 9: demonstratives and the gen. -īus / dat. -ī cells of the -īus adjectives.
  | 'pron.hic' | 'pron.ille' | 'adj.ius'
  | 'sum.3sg' | 'sum.pres' | 'sum.fut' | 'sum.impf'
  | 'possum.pres' | 'possum.fut' | 'possum.impf';

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
  // Sections 5–8 are shown only when the pack has words for their chapter.
  {
    n: 5, chapter: 5, title: 'Future and imperfect', lexical: [],
    paradigm: ['v12.fut', 'v12.impf'], leadParadigms: ['v1', 'v2', 'adj12'],
    patternKind: 'coniugatio', patternTitle: '1st & 2nd conjugation: future & imperfect',
  },
  {
    n: 6, chapter: 6, title: 'Sum and possum', lexical: [],
    paradigm: ['sum.fut', 'sum.impf', 'possum.pres', 'possum.fut', 'possum.impf'], leadParadigms: ['irr:possum'],
    patternKind: 'coniugatio', patternTitle: 'sum & possum: present, future, imperfect',
  },
  {
    n: 7, chapter: 7, title: 'Third declension', lexical: [],
    paradigm: ['n3', 'n3n'], leadParadigms: ['n3', 'n3n'],
    patternKind: 'declinatio', patternTitle: 'Third declension',
  },
  {
    n: 8, chapter: 8, title: 'Third conjugation', lexical: ['conj3'],
    paradigm: ['v3.ind', 'v3.inf', 'v3.imp', 'v3.fut', 'v3.impf'], leadParadigms: ['v3'],
    patternKind: 'coniugatio', patternTitle: 'Third conjugation: present, future, imperfect',
  },
  // Sections 9–10, likewise only when the pack has words for them.
  {
    n: 9, chapter: 9, title: 'Demonstratives', lexical: [],
    paradigm: ['pron.hic', 'pron.ille', 'adj.ius'], leadParadigms: ['pron:hic', 'pron:ille', 'adj:ius'],
    patternKind: 'declinatio', patternTitle: 'hic, ille, iste; the -īus adjectives',
  },
  {
    // Wheelock treats -iō verbs as a kind of 3rd conjugation; the conjugation question
    // names them "3rd conjugation -iō" because the 1st person singular is what tells them apart.
    n: 10, chapter: 10, title: 'Fourth conjugation and -iō verbs', lexical: ['conj4'],
    paradigm: ['v4.ind', 'v4.inf', 'v4.imp', 'v4.fut', 'v4.impf', 'v3io.ind', 'v3io.inf', 'v3io.imp', 'v3io.fut', 'v3io.impf'],
    leadParadigms: ['v4', 'v3io'],
    patternKind: 'coniugatio', patternTitle: '4th conjugation & 3rd -iō: present, future, imperfect',
  },
];

/** Sections that exist whatever the content pack holds. */
export const BASE_SECTIONS = 4;

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

/** Feature of a present-system verb cell, for the paradigm family `fam` (v12, v3, v3io, v4). */
function verbFeature(fam: 'v12' | 'v3' | 'v3io' | 'v4', cell: CellId): FeatureId | null {
  const t = tenseOf(cell);
  if (t === 'pres') return `${fam}.ind`;
  if (t === 'fut') return `${fam}.fut`;
  if (t === 'impf') return `${fam}.impf`;
  if (cell === 'pres.act.inf') return `${fam}.inf`;
  if (cell.startsWith('pres.act.imp.')) return `${fam}.imp`;
  return null;
}

/** Feature needed to drill a given cell of a lemma, or null if the cell is never drilled. */
export function featureOfCell(l: Lemma, cell: CellId): FeatureId | null {
  switch (l.paradigm) {
    case 'v1': case 'v2': return verbFeature('v12', cell);
    case 'v3': case 'v3io': case 'v4': return verbFeature(l.paradigm, cell);
    case 'n1': case 'n2m': case 'n2n': case 'n3': case 'n3n': case 'n3i': case 'n3in': return l.paradigm;
    case 'adj12': {
      const g = cell.split('.')[2] as Gender | undefined;
      return g ? (`adj.${g}` as FeatureId) : null;
    }
    case 'adj:ius': {
      // Only gen./dat. sg. (and alius's neuter aliud) differ from bonus; the rest drill as ordinary adjective cells.
      const [c, n, g] = cell.split('.') as [string, string, Gender | undefined];
      if (!g) return null;
      const aliud = (l.parts[2] ?? '').endsWith('ud') && n === 'sg' && g === 'n' && (c === 'nom' || c === 'acc');
      return (n === 'sg' && (c === 'gen' || c === 'dat')) || aliud ? 'adj.ius' : (`adj.${g}` as FeatureId);
    }
    case 'pron:hic': return cell.split('.').length === 3 ? 'pron.hic' : null;
    case 'pron:ille': return cell.split('.').length === 3 ? 'pron.ille' : null;
    case 'irr:sum': {
      const t = tenseOf(cell);
      if (t === 'fut') return 'sum.fut';
      if (t === 'impf') return 'sum.impf';
      return cell === 'pres.act.ind.3sg' ? 'sum.3sg' : cell.startsWith('pres.act.') ? 'sum.pres' : null;
    }
    case 'irr:possum': {
      const t = tenseOf(cell);
      if (t === 'fut') return 'possum.fut';
      if (t === 'impf') return 'possum.impf';
      return cell.startsWith('pres.act.') ? 'possum.pres' : null;
    }
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
    case 'v3': return ['conj3', 'v3.ind', 'v3.inf', 'v3.imp', 'v3.fut', 'v3.impf'];
    case 'v3io': case 'v4':
      return ['conj4', `${l.paradigm}.ind`, `${l.paradigm}.inf`, `${l.paradigm}.imp`, `${l.paradigm}.fut`, `${l.paradigm}.impf`];
    case 'n1': case 'n2m': case 'n2n': case 'n3': case 'n3n': case 'n3i': case 'n3in': return [l.paradigm, ...g];
    case 'adj12': return ['adj.m', 'adj.f', 'adj.n'];
    case 'adj:ius': return ['adj.m', 'adj.f', 'adj.n', 'adj.ius'];
    case 'pron:hic': return ['pron.hic'];
    case 'pron:ille': return ['pron.ille'];
    case 'irr:sum': return ['sum.pres'];
    case 'irr:possum': return ['possum.pres'];
    case 'indecl': return g;
  }
}

/**
 * Section number (1-based) in which all of `needed` are unlocked after the pattern node, or null.
 * `sections` limits the search to the sections a path actually has (default: all).
 */
export function firstEligibleSection(needed: readonly FeatureId[], sections: readonly SectionSpec[] = SECTIONS): number | null {
  for (const s of sections) {
    const have = featuresAt(s.n, true);
    if (needed.every((f) => hasFeature(have, f))) return s.n;
  }
  return null;
}
