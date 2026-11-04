/**
 * Build the private content pack the app imports on first run.
 *
 *   npx tsx scripts/build-pack.ts [wheelock.json] [out.json]
 *
 * Defaults: content/private/wheelock.json → content/private/vocabula-pack.json
 * The pack holds Wheelock-derived (copyrighted) data. It lives under the
 * gitignored content/private/ and must never be committed or bundled.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLemmaList } from '../src/data/loader.ts';
import { makePack, parsePack } from '../src/data/pack.ts';

const input = resolve(process.argv[2] ?? 'content/private/wheelock.json');
const output = resolve(process.argv[3] ?? 'content/private/vocabula-pack.json');
const lemmas = parseLemmaList(JSON.parse(readFileSync(input, 'utf8')));
const chapters = [...new Set(lemmas.map((l) => Math.min(...l.sources.map((s) => s.chapter))))].sort((a, b) => a - b);
const pack = makePack(lemmas, chapters);
parsePack(JSON.parse(JSON.stringify(pack)));
writeFileSync(output, JSON.stringify(pack) + '\n', 'utf8');
console.log(`Wrote ${pack.counts.lemmas} words (chapters ${chapters.join(', ')}) to ${output} (${statSync(output).size} bytes)`);
console.log('By chapter:', pack.counts.byChapter);
