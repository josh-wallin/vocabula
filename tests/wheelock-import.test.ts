/**
 * Runs against the private (gitignored) Wheelock list. Skipped on a fresh
 * clone where content/private/source/vocab_ch1-4.json is absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importWheelock, type WheelockEntry } from '../src/data/wheelock.ts';
import { citationForms } from '../src/morph/citation.ts';
import { splitPairedHeadword } from '../src/morph/infer.ts';

const SRC = resolve(__dirname, '../content/private/source/vocab_ch1-4.json');
const present = existsSync(SRC);

describe.skipIf(!present)('Wheelock ch. 1–4 import (private data)', () => {
  const entries = present ? (JSON.parse(readFileSync(SRC, 'utf8')) as WheelockEntry[]) : [];
  const r = importWheelock(entries);
  const inflecting = entries.filter((e) => ['noun', 'verb', 'adj'].includes(e.pos));

  it('has the expected list size', () => {
    expect(entries.length).toBe(88);
  });

  it('classifies every noun, verb and adjective', () => {
    const missed = r.unclassified.filter((u) => ['noun', 'verb', 'adj'].includes(u.entry.pos));
    expect(missed.map((u) => `${u.headword}: ${u.reason}`)).toEqual([]);
    expect(r.lowConfidence).toEqual([]);
  });

  it('every inflecting entry maps to a lemma (directly or as an inflected form)', () => {
    for (const e of inflecting) {
      const found = r.lemmas.some((l) => l.sources.some((s) => s.chapter === e.chapter && s.order === e.order));
      expect(found, `ch.${e.chapter} #${e.order} ${e.headword}`).toBe(true);
    }
  });

  it('generated citation forms match the printed headword exactly (macrons included)', () => {
    // Report every disagreement rather than fixing anything silently.
    const report = r.mismatches.map((m) => `${m.headword}: part ${m.index} printed "${m.printed}" vs generated "${m.generated}"`);
    expect(report).toEqual([]);
  });

  it('citation forms are checked against the raw printed text, not just the parsed parts', () => {
    for (const l of r.lemmas) {
      const cites = citationForms(l);
      const printed = l.headword.replace(/\([^)]*\)/g, '');
      // Each generated citation form must literally appear in the printed headword.
      for (const c of cites) expect(printed.includes(c), `${l.id}: ${c} not in "${l.headword}"`).toBe(true);
    }
  });

  it('paired entries yield both lemmas (amīcus/amīca, magister/magistra)', () => {
    const ids = r.lemmas.map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(['amicus-n2m', 'amica-n1', 'magister-n2m', 'magistra-n1']));
    const paired = entries.filter((e) => splitPairedHeadword(e.headword).length > 1);
    expect(paired).toHaveLength(2);
  });

  it('ch. 2 "est" is attached to sum as an inflected form', () => {
    expect(r.aliases.map((a) => [a.entry.headword, a.lemmaId, a.cell])).toEqual([['est', 'sum-irr-sum', 'pres.act.ind.3sg']]);
  });

  it('only the two pronouns (mē, quid) are left unclassified', () => {
    expect(r.unclassified.map((u) => u.headword).sort()).toEqual(['mē', 'quid']);
  });

  it('expected paradigm counts', () => {
    const by: Record<string, number> = {};
    for (const l of r.lemmas) by[l.paradigm] = (by[l.paradigm] ?? 0) + 1;
    expect(by).toEqual({ indecl: 12, v1: 10, v2: 7, n1: 23, n2m: 9, n2n: 9, adj12: 15, 'irr:sum': 1 });
  });
});
