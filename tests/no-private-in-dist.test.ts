/**
 * Guard: the public build must not contain Wheelock-derived text.
 * Looks for Wheelock glosses that don't also occur in the public DCC data.
 * Skipped when dist/ or the private data is absent (run after `npm run build`).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = resolve(__dirname, '../dist');
const PRIV = resolve(__dirname, '../content/private/wheelock.json');
const DCC = resolve(__dirname, '../content/dcc.json');
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
});
