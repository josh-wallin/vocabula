/**
 * Guard: the public build must not contain Wheelock- or Familia Rōmāna-derived text.
 * Looks for Wheelock glosses, and FR-only glosses (words on no Wheelock list), that don't
 * also occur in the public DCC data or the app's own writing.
 * Skipped when dist/ or the private data is absent (run after `npm run build`).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = resolve(__dirname, '../dist');
const PRIV = resolve(__dirname, '../content/private/wheelock.json');
const DCC = resolve(__dirname, '../content/dcc.json');
const FR = resolve(__dirname, '../content/private/source/fr_ch1-7.json');
const run = existsSync(DIST) && existsSync(PRIV);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe.skipIf(!run)('public build has no private content', () => {
  it('contains no Wheelock-only glosses', () => {
    const dccText = readFileSync(DCC, 'utf8').toLowerCase();
    const glosses = (JSON.parse(readFileSync(PRIV, 'utf8')) as { gloss: string }[])
      .map((l) => l.gloss.toLowerCase())
      .filter((g) => g.length >= 12 && !dccText.includes(g));
    expect(glosses.length).toBeGreaterThan(20);
    const text = files(DIST).filter((f) => /\.(js|css|html|json|webmanifest)$/.test(f)).map((f) => readFileSync(f, 'utf8').toLowerCase()).join('\n');
    const leaked = glosses.filter((g) => text.includes(g));
    expect(leaked).toEqual([]);
    expect(files(DIST).some((f) => f.includes('vocabula-pack') || f.includes('wheelock'))).toBe(false);
  });

  it.skipIf(!existsSync(FR))('contains no Familia Rōmāna-only glosses', () => {
    const publicText = [DCC, ...files(resolve(__dirname, '../content/chapters')), ...files(resolve(__dirname, '../src'))]
      .map((f) => readFileSync(f, 'utf8').toLowerCase()).join('\n');
    const entries = JSON.parse(readFileSync(FR, 'utf8')) as { gloss: string; pos: string; inWheelock: number | null }[];
    const glosses = entries
      .filter((e) => e.inWheelock === null && e.pos !== 'proper')
      .map((e) => e.gloss.toLowerCase())
      .filter((g) => g.length >= 12 && !publicText.includes(g));
    expect(glosses.length).toBeGreaterThan(20);
    const text = files(DIST).filter((f) => /\.(js|css|html|json|webmanifest)$/.test(f)).map((f) => readFileSync(f, 'utf8').toLowerCase()).join('\n');
    expect(glosses.filter((g) => text.includes(g))).toEqual([]);
    expect(files(DIST).some((f) => /fr_ch|familia/i.test(f))).toBe(false);
  });
});
