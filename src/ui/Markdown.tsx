/** Renders a grammar chapter (our own markdown in content/chapters) as HTML. */
import { useMemo } from 'preact/hooks';
import { marked } from 'marked';

export function Markdown({ src }: { src: string }) {
  // Source is our own bundled writing (no user input), so rendering marked's HTML is safe.
  const html = useMemo(() => marked.parse(src, { async: false, gfm: true }) as string, [src]);
  return <article class="chapter" lang="en" dangerouslySetInnerHTML={{ __html: html }} />;
}
