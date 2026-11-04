/**
 * Checks the Latin written for the glossary and grammar cards against the
 * private Wheelock list: every word must be a generated form of a word
 * introduced by that section. Skipped when content/private/wheelock.json is absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FormIndex } from '../src/morph/analyze.ts';
import { parseLemmaList } from '../src/data/loader.ts';
import { GLOSSARY } from '../src/content/glossary.ts';
import { GRAMMAR_CARDS, segments } from '../src/content/grammarCards.ts';
import type { Lemma } from '../src/morph/types.ts';
import { BASE_SECTIONS, SECTIONS } from '../src/engine/curriculum.ts';

const SRC = resolve(__dirname, '../content/private/wheelock.json');
const present = existsSync(SRC);
/** Ch. 1 pronouns the morphology doesn't model yet. */
const EXTRA = new Set(['mē', 'quid']);

function tokens(s: string): string[] {
  return s.split(/[\s,;:.!?·→()+=]+/).map((t) => t.trim()).filter((t) => t && !t.startsWith('-') && !t.endsWith('-') && !/^[mfn]$/.test(t));
}

describe.skipIf(!present)('authored Latin uses only unlocked vocabulary (private data)', () => {
  const lemmas: Lemma[] = present ? parseLemmaList(JSON.parse(readFileSync(SRC, 'utf8'))) : [];
  const upTo = (n: number) => new FormIndex(lemmas.filter((l) => Math.min(...l.sources.map((s) => s.chapter)) <= n));
  // Like the app (activeSections), sections 5+ exist only when the list has words for every chapter up to them.
  const chapters = new Set(lemmas.flatMap((l) => l.sources.map((s) => s.chapter)));
  const shown = (section: number) => section <= BASE_SECTIONS || SECTIONS.filter((s) => s.n <= section).every((s) => chapters.has(s.chapter));
  const check = (where: string, latin: string, section: number) => {
    if (!shown(section)) return;
    const idx = upTo(section);
    for (const t of tokens(latin)) {
      const ok = EXTRA.has(t.toLowerCase()) || idx.lookup(t).length > 0;
      expect(ok, `${where}: "${t}" is not a form of a word known by section ${section}`).toBe(true);
    }
  };

  it('glossary examples', () => {
    for (const t of GLOSSARY) check(`glossary ${t.id}`, t.ex, t.section);
  });

  it('grammar card Latin', () => {
    for (const c of GRAMMAR_CARDS) {
      const texts = [c.title, ...c.blocks.flatMap((b) => ('p' in b ? [b.p] : []))];
      for (const s of texts) for (const seg of segments(s)) if (seg.la) check(`card ${c.section}`, seg.text, c.section);
    }
  });
});
