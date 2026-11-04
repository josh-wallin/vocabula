/**
 * Audītiō lesson definitions (content/listening/*.json: DCC text and audio credits, CC BY-SA,
 * see content/listening/LICENSE.md), bundled with the app. Adding a lesson is adding a file.
 * Order: by section, then file name.
 */
import { parseListeningLesson, type ListeningLesson } from '../engine/listening.ts';

const files = import.meta.glob('../../content/listening/listen-*.json', { import: 'default', eager: true }) as Record<string, unknown>;

let cache: ListeningLesson[] | null = null;

export function listeningLessons(): ListeningLesson[] {
  cache ??= Object.keys(files).sort().map((k) => parseListeningLesson(files[k])).sort((a, b) => a.section - b.section);
  return cache;
}
