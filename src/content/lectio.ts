/**
 * Lectiō passages (content/lectio/sNN.json: original Latin, public), bundled with the app.
 * Each file holds the passages for one section. Adding a section is adding a file.
 * Order: by section, then position in the file.
 */
import { parseLectioFile, type Lectio } from '../engine/lectio.ts';

const files = import.meta.glob('../../content/lectio/s*.json', { import: 'default', eager: true }) as Record<string, unknown>;

let cache: Lectio[] | null = null;

export function lectioPassages(): Lectio[] {
  cache ??= Object.keys(files).sort().flatMap((k) => parseLectioFile(files[k])).sort((a, b) => a.section - b.section);
  return cache;
}
