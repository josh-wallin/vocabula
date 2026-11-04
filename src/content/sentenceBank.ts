/**
 * The sentence bank: original Latin sentences (content/sentences/sNN.json, public),
 * bundled with the app. Each file holds the sentences first allowed in that section.
 * Adding a section is adding a file: the glob picks it up.
 */
import { parseSentences, type Sentence } from '../engine/sentences.ts';

const files = import.meta.glob('../../content/sentences/s*.json', { import: 'default', eager: true }) as Record<string, unknown>;

let cache: Sentence[] | null = null;

/** Every sentence, ordered by file (section) and position. */
export function sentenceBank(): Sentence[] {
  cache ??= Object.keys(files).sort().flatMap((k) => parseSentences(files[k]));
  return cache;
}
