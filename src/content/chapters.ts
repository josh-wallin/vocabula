/** Grammar chapter markdown (content/chapters/chNN.md, original writing), bundled; loaded with the chapter reader. */
const chapterFiles = import.meta.glob('../../content/chapters/ch*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Grammar chapter markdown for a section (1-based), or null. */
export function chapterText(section: number): string | null {
  const key = Object.keys(chapterFiles).find((k) => k.endsWith(`ch${String(section).padStart(2, '0')}.md`));
  return key ? chapterFiles[key]! : null;
}
