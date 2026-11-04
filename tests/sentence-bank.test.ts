/**
 * The sentence bank (content/sentences/sNN.json). Shape checks always run; the
 * vocabulary/grammar checks need the private Wheelock list and are skipped without it
 * (like authored-latin.test.ts). Every token must be a word Wheelock teaches by the
 * sentence's section (no DCC-only words), in a form the morph engine generates for
 * that cell, with the cell's ending unlocked by that section.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/morph/generate.ts';
import { parseLemmaList } from '../src/data/loader.ts';
import type { Lemma } from '../src/morph/types.ts';
import { featureOfCell, featuresAt, hasFeature } from '../src/engine/curriculum.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { buildPath } from '../src/engine/path.ts';
import { dccLemmas } from '../src/content/dccList.ts';
import { sentenceBank } from '../src/content/sentenceBank.ts';
import {
  acceptedEnglish, canBuild, englishWords, latinText, orderError, parseSentences, sentenceEligible, SENT_TYPES, type Sentence,
} from '../src/engine/sentences.ts';

const DIR = resolve(__dirname, '../content/sentences');
const files = readdirSync(DIR).filter((f) => /^s\d\d\.json$/.test(f)).sort();
const bank = sentenceBank();
const FINITE = /^(pres|fut|impf)\.act\.(ind|imp)\./;
/** Words that join or introduce clauses: their sentences must spell out word order. */
const CONNECTIVES = new Set(['et-indecl', 'sed-indecl', 'si-indecl', 'dum-indecl', 'igitur-indecl', 'tamen-indecl', 'ubi-indecl', 'quando-indecl', 'quare-indecl', 'enim-indecl', 'quoniam-indecl']);

describe('sentence bank: shape', () => {
  it('files s01–s10 parse, each holding its own section, 16–20 sentences', () => {
    expect(files.slice(0, 10)).toEqual(Array.from({ length: 10 }, (_, i) => `s${String(i + 1).padStart(2, '0')}.json`));
    for (const f of files) {
      const n = Number(f.slice(1, 3));
      const list = parseSentences(JSON.parse(readFileSync(resolve(DIR, f), 'utf8')));
      expect(list.length, f).toBeGreaterThanOrEqual(16);
      expect(list.length, f).toBeLessThanOrEqual(20);
      list.forEach((s, i) => {
        expect(s.section, s.id).toBe(n);
        expect(s.id).toBe(`s${String(n).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
      });
    }
    expect(bank.length).toBe(files.reduce((k, f) => k + (JSON.parse(readFileSync(resolve(DIR, f), 'utf8')) as unknown[]).length, 0));
  });
  it('ids and Latin are unique; 2–7 words; valid order trees', () => {
    expect(new Set(bank.map((s) => s.id)).size).toBe(bank.length);
    expect(new Set(bank.map((s) => latinText(s).toLowerCase())).size).toBe(bank.length);
    for (const s of bank) {
      expect(s.tokens.length, s.id).toBeGreaterThanOrEqual(2);
      expect(s.tokens.length, s.id).toBeLessThanOrEqual(7);
      expect(orderError(s), s.id).toBeNull();
    }
  });
  it('clause words and multi-verb sentences spell out their word order', () => {
    for (const s of bank) {
      const needs = s.tokens.some((t) => CONNECTIVES.has(t.lemma)) || s.tokens.filter((t) => FINITE.test(t.cell)).length > 1;
      if (needs) expect(s.order, `${s.id} ${latinText(s)}`).toBeDefined();
    }
  });
  it('English: shown answer is accepted, has tiles, no leftover markup', () => {
    for (const s of bank) {
      expect(acceptedEnglish(s).size, s.id).toBeGreaterThan(0);
      expect(englishWords(s.en[0]!).length, s.id).toBeGreaterThanOrEqual(2);
      for (const e of s.en) expect(/[{}[\]]/.test(e.replace(/\{[^{}]*\}|\[[^[\]]*\]/g, '')), `${s.id}: ${e}`).toBe(false);
    }
  });
  it('roles are consistent with cells', () => {
    for (const s of bank) {
      for (const t of s.tokens) {
        const c = t.cell.split('.')[0];
        const where = `${s.id} ${t.form}`;
        if (t.role === 'subj' || t.role === 'pred') expect(c === 'nom' || t.cell === 'citation', where).toBe(true);
        if (t.role === 'obj') expect(c === 'acc' || t.cell === 'citation', where).toBe(true);
        if (t.role === 'iobj') expect(c, where).toBe('dat');
        if (t.role === 'voc') expect(c, where).toBe('voc');
        if (t.role === 'verb') expect(FINITE.test(t.cell), where).toBe(true);
        if (FINITE.test(t.cell)) expect(t.role, where).toBe('verb');
      }
    }
  });
  it('subject and verb agree in number (single-verb sentences, 3rd person)', () => {
    for (const s of bank) {
      const verbs = s.tokens.filter((t) => FINITE.test(t.cell));
      const subj = s.tokens.filter((t) => t.role === 'subj' && t.cell !== 'citation');
      if (verbs.length !== 1 || subj.length === 0) continue;
      const v = verbs[0]!.cell;
      const plural = subj.length > 1 || subj[0]!.cell.endsWith('.pl');
      expect(v.endsWith(plural ? '3pl' : '3sg'), `${s.id} ${latinText(s)}`).toBe(true);
    }
  });
});

const SRC = resolve(__dirname, '../content/private/wheelock.json');
const present = existsSync(SRC);

describe.skipIf(!present)('sentence bank: vocabulary and grammar (private data)', () => {
  const lemmas: Lemma[] = present ? parseLemmaList(JSON.parse(readFileSync(SRC, 'utf8'))) : [];
  const byId = new Map(lemmas.map((l) => [l.id, l]));
  const chapter = (l: Lemma) => Math.min(...l.sources.map((x) => x.chapter));
  const ENCLITIC = { que: 'que-enclitic', ne: 'ne-enclitic' } as const;

  it('every token: a Wheelock word known by its section, a generated form, an unlocked ending', () => {
    for (const s of bank) {
      const unlocked = featuresAt(s.section, true);
      for (const t of s.tokens) {
        const where = `${s.id} ${latinText(s)}: ${t.form}`;
        const l = byId.get(t.lemma);
        expect(l, `${where}: lemma ${t.lemma} is not a Wheelock word`).toBeDefined();
        if (!l) continue;
        expect(chapter(l), `${where}: taught in ch. ${chapter(l)}`).toBeLessThanOrEqual(s.section);
        expect(generate(l)[t.cell], `${where}: ${t.lemma} ${t.cell}`).toBe(t.form);
        if (l.paradigm !== 'indecl') {
          const f = featureOfCell(l, t.cell);
          expect(f !== null && hasFeature(unlocked, f), `${where}: ${t.cell} (${f}) locked in section ${s.section}`).toBe(true);
        }
        if (t.attach) {
          const e = byId.get(ENCLITIC[t.attach]);
          expect(e && chapter(e) <= s.section, `${where}: -${t.attach} not taught by section ${s.section}`).toBe(true);
        }
        if (t.phrase) expect(['prep', 'interj'].includes(l.pos), `${where}: phrase head must be a preposition or Ō`).toBe(true);
      }
    }
  });

  it('every sentence shows in the app by the end of its section, with at least three exercise types', () => {
    const lex = buildLexicon(lemmas, dccLemmas());
    const path = buildPath(lex);
    for (const s of bank) {
      const sec = path.sections.find((x) => x.spec.n === s.section);
      if (!sec) continue; // section not on this pack's path yet
      const last = sec.nodes.at(-1)!;
      const ctx = { lex, known: new Set(path.knownAt(last.id)), unlocked: new Set(last.unlocked), section: s.section };
      expect(sentenceEligible(s, ctx), `${s.id} ${latinText(s)}`).toBe(true);
      expect(SENT_TYPES.filter((t) => canBuild(s, t, ctx)).length, s.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('no sentence would show before its section (each uses something its section introduces)', () => {
    for (const s of bank) {
      if (s.section === 1) continue;
      const before = featuresAt(s.section - 1, true);
      const newHere = s.tokens.some((t) => {
        const l = byId.get(t.lemma);
        if (!l) return false;
        if (chapter(l) === s.section) return true;
        if (t.attach && chapter(byId.get(ENCLITIC[t.attach])!) === s.section) return true;
        const f = l.paradigm === 'indecl' ? null : featureOfCell(l, t.cell);
        return f !== null && !hasFeature(before, f);
      });
      expect(newHere, `${s.id} ${latinText(s)} uses nothing new in section ${s.section}`).toBe(true);
    }
  });
});

export type { Sentence };
