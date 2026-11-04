/** Renders a grammar chapter (our own markdown in content/chapters) as HTML. Its own chunk, with marked. */
import { useMemo } from 'preact/hooks';
import { marked } from 'marked';
import { chapterText } from '../content/chapters.ts';

export function Markdown({ src }: { src: string }) {
  // Source is our own bundled writing (no user input), so rendering marked's HTML is safe.
  const html = useMemo(() => marked.parse(src, { async: false, gfm: true }) as string, [src]);
  return <article class="chapter" lang="en" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A section's grammar chapter, or a note that it isn't written yet. */
export function ChapterView({ section }: { section: number }) {
  const src = chapterText(section);
  return src ? <Markdown src={src} /> : <p class="page">This chapter isn’t written yet.</p>;
}
