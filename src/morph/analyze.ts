import type { CellId, Lemma } from './types.ts';
import { generate } from './generate.ts';
import { nfc, stripMacrons } from './phonology.ts';

export interface Analysis { lemma: Lemma; cell: CellId }
export interface AnalyzeOptions {
  /** Match regardless of macrons (e.g. typed input without long marks). Default false. */
  ignoreMacrons?: boolean;
}

/** All {lemma, cell} pairs among `lemmas` whose generated form equals `form`. */
export function analyze(form: string, lemmas: readonly Lemma[], opts: AnalyzeOptions = {}): Analysis[] {
  const norm = opts.ignoreMacrons ? (s: string) => stripMacrons(s).toLowerCase() : (s: string) => nfc(s).toLowerCase();
  const target = norm(form);
  const out: Analysis[] = [];
  for (const lemma of lemmas) {
    for (const [cell, f] of Object.entries(generate(lemma))) {
      if (f !== undefined && norm(f) === target) out.push({ lemma, cell: cell as CellId });
    }
  }
  return out;
}

/** Reusable index for repeated lookups over a fixed lemma set. */
export class FormIndex {
  private map = new Map<string, Analysis[]>();
  constructor(lemmas: readonly Lemma[], private opts: AnalyzeOptions = {}) {
    for (const lemma of lemmas) {
      for (const [cell, f] of Object.entries(generate(lemma))) {
        if (f === undefined) continue;
        const k = this.key(f);
        const list = this.map.get(k) ?? [];
        list.push({ lemma, cell: cell as CellId });
        this.map.set(k, list);
      }
    }
  }
  private key(s: string): string {
    return this.opts.ignoreMacrons ? stripMacrons(s).toLowerCase() : nfc(s).toLowerCase();
  }
  lookup(form: string): Analysis[] { return this.map.get(this.key(form)) ?? []; }
}
