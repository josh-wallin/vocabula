/**
 * Convert Wheelock vocabulary lists into content/private/wheelock.json (Lemma[]).
 *
 *   npx tsx scripts/import-wheelock.ts [input.json] [output.json]
 *
 * Defaults: every content/private/source/vocab_ch*.json (ch1-4, ch5-8, ...) → content/private/wheelock.json
 * An explicit input may be one file or a comma-separated list of files.
 * content/private/ is gitignored: this is copyrighted textbook data. Never commit it.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { importWheelock, type WheelockEntry } from '../src/data/wheelock.ts';

const SOURCE_DIR = 'content/private/source';
const chStart = (f: string) => Number(/vocab_ch(\d+)/.exec(f)?.[1] ?? 0);
const inputs = process.argv[2]
  ? process.argv[2].split(',').map((f) => resolve(f))
  : readdirSync(SOURCE_DIR).filter((f) => /^vocab_ch\d+-\d+\.json$/.test(f))
      .sort((a, b) => chStart(a) - chStart(b)).map((f) => resolve(join(SOURCE_DIR, f)));
const input = inputs.join(', ');
const output = resolve(process.argv[3] ?? 'content/private/wheelock.json');

const entries = inputs.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as WheelockEntry[]);
const r = importWheelock(entries);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(r.lemmas, null, 2) + '\n', 'utf8');

console.log(`Read ${entries.length} list entries from ${input}`);
console.log(`Wrote ${r.lemmas.length} lemmas to ${output}`);
const by = r.lemmas.reduce<Record<string, number>>((a, l) => ((a[l.paradigm] = (a[l.paradigm] ?? 0) + 1), a), {});
console.log('By paradigm:', Object.entries(by).map(([k, v]) => `${k}=${v}`).join(', '));

if (r.aliases.length) {
  console.log(`\nAttached inflected-form entries (${r.aliases.length}):`);
  for (const a of r.aliases) console.log(`  ch.${a.entry.chapter} #${a.entry.order} "${a.entry.headword}" → ${a.lemmaId} [${a.cell}]`);
}
console.log(`\nUnclassified (${r.unclassified.length}):`);
for (const u of r.unclassified) console.log(`  ch.${u.entry.chapter} #${u.entry.order} ${u.entry.pos} "${u.headword}": ${u.reason}`);
console.log(`\nLow confidence (${r.lowConfidence.length}):`);
for (const l of r.lowConfidence) console.log(`  ${l.lemmaId}: ${l.reason}`);
console.log(`\nCitation-form mismatches (${r.mismatches.length}):`);
for (const m of r.mismatches) console.log(`  ${m.lemmaId} part ${m.index}: printed "${m.printed}", generated "${m.generated}"`);
if (r.mismatches.length) process.exitCode = 1;
