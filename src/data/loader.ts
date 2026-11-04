import type { Lemma } from '../morph/types.ts';

/** Minimal validation for a lemma list loaded from content/ JSON. */
export function parseLemmaList(raw: unknown): Lemma[] {
  if (!Array.isArray(raw)) throw new Error('Lemma list must be a JSON array');
  return raw.map((x, i) => {
    const o = x as Partial<Lemma>;
    if (typeof o.id !== 'string' || typeof o.headword !== 'string' || !Array.isArray(o.parts) ||
        typeof o.pos !== 'string' || typeof o.paradigm !== 'string' || typeof o.gloss !== 'string') {
      throw new Error(`Invalid lemma at index ${i}`);
    }
    return o as Lemma;
  });
}
