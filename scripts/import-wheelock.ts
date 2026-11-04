/**
 * Convert Wheelock vocabulary lists into content/private/wheelock.json (Lemma[]).
 *
 *   npx tsx scripts/import-wheelock.ts [input.json] [output.json]
 *
 * Defaults: content/private/source/vocab_ch1-4.json → content/private/wheelock.json
 * content/private/ is gitignored: this is copyrighted textbook data. Never commit it.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { importWheelock, type WheelockEntry } from '../src/data/wheelock.ts';

const input = resolve(process.argv[2] ?? 'content/private/source/vocab_ch1-4.json');
const output = resolve(process.argv[3] ?? 'content/private/wheelock.json');

const entries = JSON.parse(readFileSync(input, 'utf8')) as WheelockEntry[];
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
