/**
 * Build the private content pack the app imports on first run.
 *
 *   npx tsx scripts/build-pack.ts [wheelock.json] [out.json] [fr-source.json]
 *
 * Defaults: content/private/wheelock.json → content/private/vocabula-pack.json,
 * with Familia Rōmāna previews from content/private/source/fr_ch1-7.json when that file exists.
 * The pack holds Wheelock- and FR-derived (copyrighted) data. It lives under the
 * gitignored content/private/ and must never be committed or bundled.
 */
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLemmaList } from '../src/data/loader.ts';
import { makePack, parsePack } from '../src/data/pack.ts';
import { importFr, type FrSourceEntry } from '../src/data/fr.ts';

const input = resolve(process.argv[2] ?? 'content/private/wheelock.json');
const output = resolve(process.argv[3] ?? 'content/private/vocabula-pack.json');
const frInput = resolve(process.argv[4] ?? 'content/private/source/fr_ch1-7.json');
const lemmas = parseLemmaList(JSON.parse(readFileSync(input, 'utf8')));
const chapters = [...new Set(lemmas.map((l) => Math.min(...l.sources.map((s) => s.chapter))))].sort((a, b) => a - b);

let fr;
if (existsSync(frInput)) {
  const r = importFr(JSON.parse(readFileSync(frInput, 'utf8')) as FrSourceEntry[], lemmas);
  fr = r.entries;
  const why = r.excluded.reduce<Record<string, number>>((a, x) => {
    const k = x.reason.replace(/ \(.*\)$/, '').replace(/ ch\. \d+$/, '');
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});
  console.log(`Familia Rōmāna: ${r.entries.length} preview words kept; excluded:`, why);
  if (r.fallback.length) console.log(`  ${r.fallback.length} kept without a paradigm (meaning only anyway): ${r.fallback.map((f) => f.entry.lemma).join(', ')}`);
} else {
  console.log(`No Familia Rōmāna list at ${frInput}; building without previews.`);
}

const pack = makePack(lemmas, chapters, new Date(), fr);
parsePack(JSON.parse(JSON.stringify(pack)));
writeFileSync(output, JSON.stringify(pack) + '\n', 'utf8');
console.log(`Wrote ${pack.counts.lemmas} words (chapters ${chapters.join(', ')}) to ${output} (${statSync(output).size} bytes)`);
console.log('By chapter:', pack.counts.byChapter);
if (pack.counts.fr) console.log('Familia Rōmāna by chapter:', pack.counts.fr);
