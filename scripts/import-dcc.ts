/**
 * Convert the DCC Latin Core Vocabulary into content/dcc.json (Lemma[]).
 *   npx tsx scripts/import-dcc.ts [input.json] [output.json]
 * Data: Dickinson College Commentaries, https://dcc.dickinson.edu, CC BY-SA 3.0 Unported.
 * content/dcc.json is a derived dataset and stays under CC BY-SA 3.0 (see content/DCC-LICENSE.md).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { importDcc, type DccEntry } from '../src/data/dcc.ts';

const input = resolve(process.argv[2] ?? 'content/source/dcc-core-latin.json');
const output = resolve(process.argv[3] ?? 'content/dcc.json');
const entries = JSON.parse(readFileSync(input, 'utf8')) as DccEntry[];
const r = importDcc(entries);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(r.lemmas, null, 2) + '\n', 'utf8');
const by = r.lemmas.reduce<Record<string, number>>((a, l) => ((a[l.paradigm] = (a[l.paradigm] ?? 0) + 1), a), {});
console.log(`Read ${entries.length} DCC entries; wrote ${r.lemmas.length} lemmas to ${output}`);
console.log('By paradigm:', Object.entries(by).map(([k, v]) => `${k}=${v}`).join(', '));
console.log(`Skipped (paradigm not implemented yet): ${r.skipped.length}`);
console.log(`\nProblems (${r.problems.length}):`);
for (const p of r.problems) console.log(`  #${p.entry.rank} ${p.entry.headword} [${p.entry.pos}]: ${p.reason}`);
