/**
 * Grammar chapter reader, split out with marked and the chapter markdown (src/ui/MarkdownView.tsx).
 * <Markdown section={n} /> shows section n's chapter (or that it isn't written yet).
 */
import { lazy } from './lazy.tsx';

export const Markdown = lazy(() => import('./MarkdownView.tsx').then((m) => m.ChapterView));
