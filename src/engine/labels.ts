/** Human labels for cells and features. */
import type { CellId } from '../morph/types.ts';

const CASE_NAME: Record<string, string> = {
  nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', abl: 'ablative', voc: 'vocative',
};
const NUM_NAME: Record<string, string> = { sg: 'singular', pl: 'plural' };
const GEN_NAME: Record<string, string> = { m: 'masculine', f: 'feminine', n: 'neuter' };
const PERSON_NAME: Record<string, string> = { '1': '1st person', '2': '2nd person', '3': '3rd person' };

export const genderName = (g: string): string => GEN_NAME[g] ?? g;

/** "genitive plural", "dative singular feminine", "3rd person plural", "infinitive", "imperative singular". */
export function cellLabel(cell: CellId): string {
  if (cell === 'citation') return 'form';
  if (cell === 'pres.act.inf') return 'present infinitive';
  if (cell.startsWith('pres.act.imp.')) return `imperative ${cell.endsWith('2sg') ? 'singular' : 'plural'}`;
  if (cell.startsWith('pres.act.ind.')) {
    const p = cell.slice(-3);
    return `${PERSON_NAME[p[0]!]} ${NUM_NAME[p.slice(1)]}`;
  }
  const [c, n, g] = cell.split('.');
  return [CASE_NAME[c!], NUM_NAME[n!], g ? GEN_NAME[g] : undefined].filter(Boolean).join(' ');
}

/** Label used in "Give the … of" prompts (adds "present" for finite verb cells). */
export function cellPrompt(cell: CellId): string {
  if (cell.startsWith('pres.act.ind.')) return `${cellLabel(cell)} present`;
  return cellLabel(cell);
}
