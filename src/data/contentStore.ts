/**
 * The one place the app gets its content from.
 *
 * Public, bundled: the DCC core list (CC BY-SA) and the grammar chapters.
 * Private: the Wheelock-derived content pack, imported by the user and kept in
 * IndexedDB. A later milestone swaps importPack/loadPrivate for an
 * authenticated sync API; nothing outside this module needs to change.
 */
import type { Lemma } from '../morph/types.ts';
import dccRaw from '../../content/dcc.json';
import { parseLemmaList } from './loader.ts';
import { parsePack, type ContentPack } from './pack.ts';
import { getPack, savePack } from './db.ts';

const chapterFiles = import.meta.glob('../../content/chapters/ch*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface Content {
  pack: ContentPack;
  wheelock: Lemma[];
  dcc: Lemma[];
}

let dccCache: Lemma[] | null = null;
export function dccLemmas(): Lemma[] {
  dccCache ??= parseLemmaList(dccRaw);
  return dccCache;
}

/** Grammar chapter markdown for a section (1-based), or null. */
export function chapterText(section: number): string | null {
  const key = Object.keys(chapterFiles).find((k) => k.endsWith(`ch${String(section).padStart(2, '0')}.md`));
  return key ? chapterFiles[key]! : null;
}

/** Load content if a pack has been imported on this device; null means "show the import screen". */
export async function loadContent(): Promise<Content | null> {
  const pack = await getPack();
  if (!pack) return null;
  return { pack, wheelock: pack.lemmas, dcc: dccLemmas() };
}

/** Validate and store a pack from file text or pasted text. Throws a readable error. */
export async function importPack(text: string): Promise<ContentPack> {
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^﻿/, '')); } catch { throw new Error('That isn’t valid JSON. Pick the vocabula-pack.json file, or paste its full contents.'); }
  const pack = parsePack(raw);
  await savePack(pack);
  return pack;
}
