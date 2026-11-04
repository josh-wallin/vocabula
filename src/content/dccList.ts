/**
 * The DCC Latin Core Vocabulary (content/dcc.json, CC BY-SA), parsed. Kept out of the main
 * chunk: the app loads it with a dynamic import in loadContent (src/data/contentStore.ts);
 * the service worker precaches the chunk, so it is there offline.
 */
import type { Lemma } from '../morph/types.ts';
import dccRaw from '../../content/dcc.json';
import { parseLemmaList } from '../data/loader.ts';

let cache: Lemma[] | null = null;
export function dccLemmas(): Lemma[] {
  cache ??= parseLemmaList(dccRaw);
  return cache;
}
