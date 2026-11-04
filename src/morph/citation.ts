import type { Lemma } from './types.ts';
import { generate } from './generate.ts';

/**
 * Citation forms regenerated from the paradigm, in the order a dictionary
 * headword prints them. Compare with `lemma.parts` to catch inference errors.
 */
export function citationForms(l: Lemma): string[] {
  const p = generate(l);
  const pl = l.number === 'pl';
  switch (l.paradigm) {
    case 'n1': case 'n2m': case 'n2n':
      return pl ? [p['nom.pl']!, p['gen.pl']!] : [p['nom.sg']!, p['gen.sg']!];
    case 'adj12':
      return pl ? [p['nom.pl.m']!, p['nom.pl.f']!, p['nom.pl.n']!] : [p['nom.sg.m']!, p['nom.sg.f']!, p['nom.sg.n']!];
    case 'v1': case 'v2': case 'irr:sum':
      return [p['pres.act.ind.1sg']!, p['pres.act.inf']!];
    case 'indecl':
      return [p.citation!];
  }
}

/** Mismatches between printed parts and regenerated citation forms (empty = consistent). */
export function citationMismatches(l: Lemma): { index: number; printed: string | undefined; generated: string }[] {
  return citationForms(l).flatMap((g, i) => (l.parts[i] === g ? [] : [{ index: i, printed: l.parts[i], generated: g }]));
}
