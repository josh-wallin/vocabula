/**
 * The public content bundled with the app (sentence bank, Audītiō lessons, Lectiō passages),
 * loaded with dynamic imports so its JSON stays out of the main chunk. The service worker
 * precaches every chunk, so this works offline exactly like a static import.
 * Node scripts and tests keep importing the loader modules directly.
 */
import type { Sentence } from '../engine/sentences.ts';
import type { ListeningLesson } from '../engine/listening.ts';
import type { Lectio } from '../engine/lectio.ts';

export interface Bundled {
  sentences: Sentence[];
  listening: ListeningLesson[];
  lectio: Lectio[];
}

let pending: Promise<Bundled> | null = null;

export function loadBundled(): Promise<Bundled> {
  pending ??= Promise.all([import('./sentenceBank.ts'), import('./listening.ts'), import('./lectio.ts')])
    .then(([s, l, r]) => ({ sentences: s.sentenceBank(), listening: l.listeningLessons(), lectio: r.lectioPassages() }))
    .catch((e: unknown) => { pending = null; throw e; });
  return pending;
}
