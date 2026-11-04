import type { Lemma, PartOfSpeech, Source } from './types.ts';
import { inferParadigm, lemmaId, type InferHints, type Inference } from './infer.ts';

/** Build a Lemma from a printed headword via inference. Returns the inference too, for reporting. */
export function lemmaFromHeadword(
  headword: string, pos: PartOfSpeech, gloss: string, sources: Source[], hints: InferHints = {},
): { lemma: Lemma | null; inference: Inference } {
  const inference = inferParadigm(headword, pos, hints);
  if (!inference.paradigm || inference.confidence === 'none') return { lemma: null, inference };
  const lemma: Lemma = {
    id: lemmaId(inference.parts[0]!, inference.paradigm),
    headword,
    parts: inference.parts,
    pos,
    paradigm: inference.paradigm,
    gloss,
    sources,
    ...(inference.gender ? { gender: inference.gender } : {}),
    ...(inference.number ? { number: inference.number } : {}),
    ...(inference.irregular ? { irregular: inference.irregular } : {}),
  };
  return { lemma, inference };
}
