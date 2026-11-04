/**
 * Private content pack: the Wheelock-derived data the public app may not bundle.
 * Built by scripts/build-pack.ts, imported once per device, stored in IndexedDB.
 */
import type { Lemma } from '../morph/types.ts';
import { parseLemmaList } from './loader.ts';

export const PACK_FORMAT = 'vocabula-pack';
export const PACK_SCHEMA = 1;

export interface ContentPack {
  format: typeof PACK_FORMAT;
  schema: number;
  /** Free-form content version, e.g. "wheelock-ch1-4". */
  id: string;
  builtAt: string;
  chapters: number[];
  counts: { lemmas: number; byChapter: Record<string, number> };
  lemmas: Lemma[];
}

export function makePack(lemmas: Lemma[], chapters: number[], now = new Date()): ContentPack {
  const byChapter: Record<string, number> = {};
  for (const l of lemmas) {
    const c = Math.min(...l.sources.map((s) => s.chapter));
    byChapter[String(c)] = (byChapter[String(c)] ?? 0) + 1;
  }
  return {
    format: PACK_FORMAT, schema: PACK_SCHEMA, id: `wheelock-ch${chapters[0]}-${chapters[chapters.length - 1]}`,
    builtAt: now.toISOString(), chapters, counts: { lemmas: lemmas.length, byChapter }, lemmas,
  };
}

/** Validate an imported pack. Throws with a user-readable message. */
export function parsePack(raw: unknown): ContentPack {
  const p = raw as Partial<ContentPack> | null;
  if (!p || typeof p !== 'object' || p.format !== PACK_FORMAT) throw new Error('This file is not a Vocābula content pack.');
  if (p.schema !== PACK_SCHEMA) throw new Error(`Unsupported pack schema ${String(p.schema)} (this app reads schema ${PACK_SCHEMA}).`);
  if (!Array.isArray(p.chapters) || !p.counts || typeof p.counts.lemmas !== 'number') throw new Error('Pack is missing its header.');
  const lemmas = parseLemmaList(p.lemmas);
  if (lemmas.length !== p.counts.lemmas) throw new Error(`Pack says ${p.counts.lemmas} words but contains ${lemmas.length}.`);
  const byChapter: Record<string, number> = {};
  for (const l of lemmas) {
    if (!l.sources.length) throw new Error(`Word ${l.id} has no chapter.`);
    const c = String(Math.min(...l.sources.map((s) => s.chapter)));
    byChapter[c] = (byChapter[c] ?? 0) + 1;
  }
  for (const [c, n] of Object.entries(p.counts.byChapter ?? {})) {
    if (byChapter[c] !== n) throw new Error(`Pack count mismatch in chapter ${c}.`);
  }
  for (const c of p.chapters) if (!byChapter[String(c)]) throw new Error(`Pack has no words for chapter ${c}.`);
  return p as ContentPack;
}
