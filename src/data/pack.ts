/**
 * Private content pack: the Wheelock-derived data the public app may not bundle.
 * Built by scripts/build-pack.ts, imported once per device, stored in IndexedDB.
 */
import type { Lemma } from '../morph/types.ts';
import type { FrEntry } from './fr.ts';
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
  counts: { lemmas: number; byChapter: Record<string, number>; fr?: Record<string, number> };
  lemmas: Lemma[];
  /**
   * Optional Familia Rōmāna preview words (meaning only), by FR chapter. Packs without it
   * are still valid and build the same path as before.
   */
  fr?: FrEntry[];
}

const frCounts = (fr: readonly FrEntry[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const e of fr) out[String(e.chapter)] = (out[String(e.chapter)] ?? 0) + 1;
  return out;
};

export function makePack(lemmas: Lemma[], chapters: number[], now = new Date(), fr?: FrEntry[]): ContentPack {
  const byChapter: Record<string, number> = {};
  for (const l of lemmas) {
    const c = Math.min(...l.sources.map((s) => s.chapter));
    byChapter[String(c)] = (byChapter[String(c)] ?? 0) + 1;
  }
  const frChapters = fr?.length ? [...new Set(fr.map((e) => e.chapter))].sort((a, b) => a - b) : [];
  const id = `wheelock-ch${chapters[0]}-${chapters[chapters.length - 1]}` +
    (frChapters.length ? `+fr-cap${frChapters[0]}-${frChapters[frChapters.length - 1]}` : '');
  return {
    format: PACK_FORMAT, schema: PACK_SCHEMA, id,
    builtAt: now.toISOString(), chapters,
    counts: { lemmas: lemmas.length, byChapter, ...(fr?.length ? { fr: frCounts(fr) } : {}) },
    lemmas, ...(fr?.length ? { fr } : {}),
  };
}

function parseFr(raw: unknown, counts: Record<string, number> | undefined): FrEntry[] {
  if (!Array.isArray(raw)) throw new Error('Pack field "fr" must be a list.');
  const lemmas = parseLemmaList(raw.map((e: Partial<FrEntry> | null) => e?.lemma));
  const ids = new Set<string>();
  raw.forEach((e: Partial<FrEntry>, i) => {
    if (typeof e.chapter !== 'number' || !Number.isInteger(e.chapter) || e.chapter < 1) throw new Error(`Familia Rōmāna word ${i} has no chapter.`);
    if (typeof e.order !== 'number') throw new Error(`Familia Rōmāna word ${i} has no order.`);
    if (ids.has(lemmas[i]!.id)) throw new Error(`Familia Rōmāna word ${lemmas[i]!.id} appears twice.`);
    ids.add(lemmas[i]!.id);
  });
  if (counts) {
    const have = frCounts(raw as FrEntry[]);
    const keys = new Set([...Object.keys(have), ...Object.keys(counts)]);
    for (const c of keys) if (have[c] !== counts[c]) throw new Error(`Pack count mismatch in Familia Rōmāna chapter ${c}.`);
  }
  return raw as FrEntry[];
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
  if (p.fr !== undefined) parseFr(p.fr, p.counts.fr);
  else if (p.counts.fr && Object.keys(p.counts.fr).length) throw new Error('Pack counts Familia Rōmāna words but contains none.');
  return p as ContentPack;
}

/** The canonical text of a pack: what the server stores and what its hash covers. */
export const packText = (pack: ContentPack): string => JSON.stringify(pack);

/** SHA-256 (hex) of the canonical pack text; the server's ETag and the client's If-None-Match. */
export async function packHash(pack: ContentPack): Promise<string> {
  const bytes = new TextEncoder().encode(packText(pack));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
