/**
 * Historia entries (content/historia/*.json: public-domain Latin with original glosses,
 * translations, essays and questions), bundled with the app. Adding an entry is adding a file.
 * Order: by `order`, then id.
 */
import { parseHistoriaEntry, type HistoriaEntry } from '../engine/historia.ts';

const files = import.meta.glob('../../content/historia/*.json', { import: 'default', eager: true }) as Record<string, unknown>;

let cache: HistoriaEntry[] | null = null;

export function historiaEntries(): HistoriaEntry[] {
  cache ??= Object.keys(files).sort().map((k) => parseHistoriaEntry(files[k])).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return cache;
}
