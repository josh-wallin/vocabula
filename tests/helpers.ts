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

export function verbTable(ind: string[], inf: string, imp: [string, string]): Record<string, string> {
  const ps = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];
  const out: Record<string, string> = {};
  ps.forEach((p, i) => { out[`pres.act.ind.${p}`] = ind[i]!; });
  out['pres.act.inf'] = inf;
  out['pres.act.imp.2sg'] = imp[0];
  out['pres.act.imp.2pl'] = imp[1];
  return out;
}
