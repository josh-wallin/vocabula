/**
 * Build the private content pack the app imports on first run.
 *
 *   npx tsx scripts/build-pack.ts [wheelock.json] [out.json] [fr-source.json[,more.json…]]
 *
 * Defaults: content/private/wheelock.json → content/private/vocabula-pack.json,
 * with Familia Rōmāna previews from every content/private/source/fr_ch*.json (in chapter order:
 * fr_ch1-7.json, fr_ch8-15.json, …) when there are any. Placement: FR_PLACEMENT in src/data/frPlacement.ts.
 * The pack holds Wheelock- and FR-derived (copyrighted) data. It lives under the
 * gitignored content/private/ and must never be committed or bundled.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLemmaList } from '../src/data/loader.ts';
import { makePack, parsePack } from '../src/data/pack.ts';
import { importFr, frSection, type FrSourceEntry } from '../src/data/fr.ts';

const input = resolve(process.argv[2] ?? 'content/private/wheelock.json');
const output = resolve(process.argv[3] ?? 'content/private/vocabula-pack.json');
const frDir = resolve('content/private/source');
/** fr_ch1-7.json, fr_ch8-15.json, … ordered by first chapter, so list order (and `order`) stays stable. */
const frFiles = process.argv[4]
  ? process.argv[4].split(',').map((f) => resolve(f))
  : existsSync(frDir)
    ? readdirSync(frDir).filter((f) => /^fr_ch\d+.*\.json$/.test(f))
      .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0])).map((f) => resolve(frDir, f))
    : [];
const lemmas = parseLemmaList(JSON.parse(readFileSync(input, 'utf8')));
const chapters = [...new Set(lemmas.map((l) => Math.min(...l.sources.map((s) => s.chapter))))].sort((a, b) => a - b);

let fr;
const frPresent = frFiles.filter((f) => existsSync(f));
if (frPresent.length) {
  const source = frPresent.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as FrSourceEntry[]);
  console.log(`Familia Rōmāna lists: ${frPresent.map((f) => f.replace(/^.*\//, '')).join(', ')} (${source.length} entries)`);
  const r = importFr(source, lemmas);
  fr = r.entries;
  const why = r.excluded.reduce<Record<string, number>>((a, x) => {
    const k = x.reason.replace(/ \(.*\)$/, '').replace(/ ch\. \d+$/, '').replace(/ chapter \d+$/, '').replace(/^duplicate of .*$/, 'duplicate');
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});
  console.log(`Familia Rōmāna: ${r.entries.length} preview words kept; excluded:`, why);
  if (r.fallback.length) console.log(`  ${r.fallback.length} kept without a paradigm (meaning only anyway): ${r.fallback.map((f) => f.entry.lemma).join(', ')}`);
} else {
  console.log(`No Familia Rōmāna list (${frFiles.length ? frFiles.join(', ') : `${frDir}/fr_ch*.json`}); building without previews.`);
}

const pack = makePack(lemmas, chapters, new Date(), fr);
parsePack(JSON.parse(JSON.stringify(pack)));
writeFileSync(output, JSON.stringify(pack) + '\n', 'utf8');
console.log(`Wrote ${pack.counts.lemmas} words (chapters ${chapters.join(', ')}) to ${output} (${statSync(output).size} bytes)`);
console.log('By chapter:', pack.counts.byChapter);
if (pack.counts.fr) {
  console.log('Familia Rōmāna by chapter:', pack.counts.fr);
  console.log('  placed after section:', Object.fromEntries(Object.keys(pack.counts.fr).map((c) => [c, frSection(Number(c))])),
    '(a preview shows only once the path has that section)');
}
