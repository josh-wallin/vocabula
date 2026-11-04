/** Human labels for cells and features. */
import type { CellId } from '../morph/types.ts';
import { tenseOf } from '../morph/cells.ts';

const CASE_NAME: Record<string, string> = {
  nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', abl: 'ablative', voc: 'vocative',
};
const NUM_NAME: Record<string, string> = { sg: 'singular', pl: 'plural' };
const GEN_NAME: Record<string, string> = { m: 'masculine', f: 'feminine', n: 'neuter' };
const PERSON_NAME: Record<string, string> = { '1': '1st person', '2': '2nd person', '3': '3rd person' };
const TENSE_NAME: Record<string, string> = { pres: 'present', fut: 'future', impf: 'imperfect' };

export const genderName = (g: string): string => GEN_NAME[g] ?? g;

/**
 * "genitive plural", "dative singular feminine", "3rd person plural" (present),
 * "3rd person plural future", "infinitive", "imperative singular".
 */
export function cellLabel(cell: CellId): string {
  if (cell === 'citation') return 'form';
  if (cell === 'pres.act.inf') return 'present infinitive';
  if (cell.startsWith('pres.act.imp.')) return `imperative ${cell.endsWith('2sg') ? 'singular' : 'plural'}`;
  const t = tenseOf(cell);
  if (t) {
    const p = cell.slice(-3);
    const pn = `${PERSON_NAME[p[0]!]} ${NUM_NAME[p.slice(1)]}`;
    return t === 'pres' ? pn : `${pn} ${TENSE_NAME[t]}`;
  }
  const [c, n, g] = cell.split('.');
  return [CASE_NAME[c!], NUM_NAME[n!], g ? GEN_NAME[g] : undefined].filter(Boolean).join(' ');
}

/** Label used in "Give the … of" prompts (every finite verb cell names its tense). */
export function cellPrompt(cell: CellId): string {
  if (cell.startsWith('pres.act.ind.')) return `${cellLabel(cell)} present`;
  return cellLabel(cell);
}

/** Labels for a set of parse options: finite verb cells name the tense once options span several tenses. */
export function optionLabeler(cells: readonly CellId[]): (c: CellId) => string {
  const tensed = cells.some((c) => { const t = tenseOf(c); return t !== null && t !== 'pres'; });
  return tensed ? cellPrompt : cellLabel;
}
