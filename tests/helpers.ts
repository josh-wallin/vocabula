import type { Lemma, PartOfSpeech } from '../src/morph/types.ts';
import { lemmaFromHeadword } from '../src/morph/lemma.ts';
import { CASES } from '../src/morph/cells.ts';

/** Build a lemma through the real inference path, failing loudly if it can't. */
export function L(headword: string, pos: PartOfSpeech, gloss = ''): Lemma {
  const { lemma, inference } = lemmaFromHeadword(headword, pos, gloss, []);
  if (!lemma) throw new Error(`could not infer ${headword}: ${inference.reason}`);
  return lemma;
}

/** Expand a 12-form noun table (sg nom..voc, pl nom..voc) into cell → form. */
export function nounTable(sg: string[], pl: string[], suffix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  CASES.forEach((c, i) => { out[`${c}.sg${suffix}`] = sg[i]!; out[`${c}.pl${suffix}`] = pl[i]!; });
  return out;
}

const PS = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];

/** Six forms of one tense (1sg … 3pl) → cell → form. */
export function tenseTable(tense: 'pres' | 'fut' | 'impf', forms: string[]): Record<string, string> {
  if (forms.length !== 6) throw new Error(`tenseTable needs 6 forms, got ${forms.length}`);
  const out: Record<string, string> = {};
  PS.forEach((p, i) => { out[`${tense}.act.ind.${p}`] = forms[i]!; });
  return out;
}

/** Present system table: present indicative, infinitive, imperatives (+ future and imperfect when given). */
export function verbTable(
  ind: string[], inf: string, imp: [string, string] | null, more: { fut?: string[]; impf?: string[] } = {},
): Record<string, string> {
  const out: Record<string, string> = { ...tenseTable('pres', ind), 'pres.act.inf': inf };
  if (imp) { out['pres.act.imp.2sg'] = imp[0]; out['pres.act.imp.2pl'] = imp[1]; }
  if (more.fut) Object.assign(out, tenseTable('fut', more.fut));
  if (more.impf) Object.assign(out, tenseTable('impf', more.impf));
  return out;
}

/** Only the cells of `table` named in `keys` (to compare a slice of a paradigm). */
export const pickCells = (table: Record<string, string | undefined>, prefix: string): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(table).filter(([k]) => k.startsWith(prefix)));
