/**
 * Conversion of Wheelock vocabulary lists (raw JSON from content/private/source)
 * into Lemma records. Pure: no file I/O, so tests and the CLI share it.
 */
import type { Gender, Lemma, PartOfSpeech, Source } from '../morph/types.ts';
import { lemmaFromHeadword } from '../morph/lemma.ts';
import { splitPairedHeadword, type Inference } from '../morph/infer.ts';
import { citationMismatches } from '../morph/citation.ts';
import { analyze } from '../morph/analyze.ts';
import { nfc } from '../morph/phonology.ts';

export interface WheelockEntry {
  chapter: number;
  order: number;
  headword: string;
  lemma: string;
  pos: string;
  gender: string | null;
  declension_or_conjugation: string | null;
  meaning: string;
  notes: string;
  uncertain?: boolean;
}

export interface Unclassified { entry: WheelockEntry; headword: string; reason: string }
export interface Mismatch { lemmaId: string; headword: string; index: number; printed: string | undefined; generated: string }
export interface AliasNote { entry: WheelockEntry; lemmaId: string; cell: string }

export interface ImportResult {
  lemmas: Lemma[];
  unclassified: Unclassified[];
  lowConfidence: { lemmaId: string; reason: string }[];
  mismatches: Mismatch[];
  /** Entries printed as an inflected form (e.g. "est") and attached to their lemma. */
  aliases: AliasNote[];
}

const POS_MAP: Record<string, PartOfSpeech> = {
  noun: 'noun', verb: 'verb', adj: 'adj', adv: 'adv', pron: 'pron',
  prep: 'prep', conj: 'conj', interj: 'interj', num: 'num',
};
const asGender = (g: string | null): Gender | null => (g === 'm' || g === 'f' || g === 'n' ? g : null);

export function importWheelock(entries: readonly WheelockEntry[]): ImportResult {
  const byId = new Map<string, Lemma>();
  const unclassified: Unclassified[] = [];
  const lowConfidence: ImportResult['lowConfidence'] = [];
  const deferred: WheelockEntry[] = [];

  const sorted = [...entries].sort((a, b) => a.chapter - b.chapter || a.order - b.order);
  for (const e of sorted) {
    const pos = POS_MAP[e.pos];
    if (!pos) { unclassified.push({ entry: e, headword: e.headword, reason: `unknown pos "${e.pos}"` }); continue; }
    const source: Source = { book: 'wheelock', chapter: e.chapter, order: e.order };
    const heads = splitPairedHeadword(e.headword);
    for (const [i, head] of heads.entries()) {
      // In a paired entry, the list gender/declension describes the first member only.
      const hints = i === 0 ? { gender: asGender(e.gender), declension: e.declension_or_conjugation } : {};
      const gloss = nfc(e.meaning);
      const { lemma, inference } = lemmaFromHeadword(head, pos, gloss, [source], hints);
      if (!lemma) {
        if (pos === 'verb' || pos === 'noun' || pos === 'adj') deferred.push(e);
        else unclassified.push({ entry: e, headword: head, reason: reasonOf(inference) });
        continue;
      }
      if (e.notes) lemma.notes = nfc(e.notes);
      const existing = byId.get(lemma.id);
      if (existing) { existing.sources.push(source); continue; }
      if (inference.confidence === 'low') lowConfidence.push({ lemmaId: lemma.id, reason: reasonOf(inference) });
      byId.set(lemma.id, lemma);
    }
  }

  // Entries printed as an inflected form (Wheelock ch. 2 "est") are attached to
  // the lemma whose paradigm generates them, if exactly one lemma does.
  const aliases: AliasNote[] = [];
  const lemmas = [...byId.values()];
  for (const e of deferred) {
    const hits = analyze(e.headword, lemmas);
    const lemmaIds = new Set(hits.map((h) => h.lemma.id));
    if (hits.length > 0 && lemmaIds.size === 1) {
      const hit = hits[0]!;
      hit.lemma.sources.push({ book: 'wheelock', chapter: e.chapter, order: e.order, as: nfc(e.headword) });
      aliases.push({ entry: e, lemmaId: hit.lemma.id, cell: hit.cell });
    } else {
      const { inference } = lemmaFromHeadword(e.headword, POS_MAP[e.pos]!, e.meaning, []);
      unclassified.push({ entry: e, headword: e.headword, reason: reasonOf(inference) });
    }
  }
  for (const l of lemmas) l.sources.sort((a, b) => a.chapter - b.chapter || a.order - b.order);

  const mismatches: Mismatch[] = lemmas.flatMap((l) =>
    citationMismatches(l).map((m) => ({ lemmaId: l.id, headword: l.headword, ...m })));
  return { lemmas, unclassified, lowConfidence, mismatches, aliases };
}

function reasonOf(inf: Inference): string {
  return inf.reason ?? (inf.paradigm ? `classified as ${inf.paradigm} (${inf.confidence})` : 'unclassified');
}
