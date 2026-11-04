import { describe, expect, it } from 'vitest';
import { fixLexicon, fixPath } from './fixtures.ts';
import { dccBySection, MAX_DCC_PER_SECTION, MAX_VERBA, splitEven, currentNodeIndex, isUnlocked } from '../src/engine/path.ts';
import { featuresAt, featuresNeeded, firstEligibleSection } from '../src/engine/curriculum.ts';
import { matchKey } from '../src/engine/lexicon.ts';

describe('path builder', () => {
  const path = fixPath();
  const kinds = (n: number) => path.sections[n - 1]!.nodes.map((x) => x.id);

  it('builds sections 1–4 with the expected node lists', () => {
    expect(path.sections.map((s) => s.spec.n)).toEqual([1, 2, 3, 4]);
    expect(kinds(1)).toEqual([
      's1.verba.1', 's1.pattern', 's1.verba.2', 's1.rep.1', 's1.formae', 's1.dcc.1', 's1.dcc.2', 's1.rep.2',
    ]);
    expect(kinds(2)).toEqual(['s2.verba.1', 's2.pattern', 's2.formae', 's2.dcc.1', 's2.rep.1']);
    expect(kinds(3)).toEqual(['s3.verba.1', 's3.pattern', 's3.formae', 's3.dcc.1', 's3.rep.1']);
    expect(kinds(4)).toEqual(['s4.verba.1', 's4.pattern', 's4.formae', 's4.dcc.1', 's4.rep.1', 's4.probatio']);
  });

  it('teaches every chapter word exactly once, in lessons of at most MAX_VERBA', () => {
    const verba = path.nodes.filter((n) => n.kind === 'verba');
    for (const n of verba) expect(n.newWords.length).toBeLessThanOrEqual(MAX_VERBA);
    const taught = path.nodes.flatMap((n) => n.newWords);
    expect(new Set(taught).size).toBe(taught.length);
    const lex = fixLexicon();
    expect(taught.sort()).toEqual(lex.words.map((w) => w.lemma.id).sort());
  });

  it('leads each section with its new paradigm (verbs in s1)', () => {
    expect(path.nodes[0]!.newWords.every((id) => id.endsWith('-v1') || id.endsWith('-v2'))).toBe(true);
    // the adverb comes after the verbs
    expect(path.sections[0]!.nodes.find((n) => n.id === 's1.verba.2')!.newWords).toContain('nunc-indecl');
  });

  it('ends with a closing Repetītiō per section and a Probātiō after section 4', () => {
    for (const s of path.sections.slice(0, 3)) expect(s.nodes[s.nodes.length - 1]!.kind).toBe('repetitio');
    expect(path.nodes[path.nodes.length - 1]!.kind).toBe('probatio');
  });

  it('pattern node unlocks the section paradigm; the verba before it does not', () => {
    const v1 = path.nodes.find((n) => n.id === 's2.verba.1')!;
    const pat = path.nodes.find((n) => n.id === 's2.pattern')!;
    expect(v1.unlocked).not.toContain('n1');
    expect(v1.unlocked).toContain('gender.mf');
    expect(pat.unlocked).toContain('n1');
    expect(pat.unlocked).not.toContain('gender.n');
  });

  it('unlocks nodes sequentially', () => {
    const done = new Set<string>();
    expect(currentNodeIndex(path, done)).toBe(0);
    expect(isUnlocked(path, done, 's1.pattern')).toBe(false);
    done.add('s1.verba.1');
    expect(isUnlocked(path, done, 's1.pattern')).toBe(true);
    expect(isUnlocked(path, done, 's1.verba.1')).toBe(true); // replayable
  });

  it('splitEven balances lesson sizes', () => {
    expect(splitEven([1, 2, 3, 4, 5, 6, 7, 8], 6).map((x) => x.length)).toEqual([4, 4]);
    expect(splitEven([...Array(18).keys()], 6).map((x) => x.length)).toEqual([6, 6, 6]);
    expect(splitEven([...Array(25).keys()], 6).map((x) => x.length)).toEqual([5, 5, 5, 5, 5]);
  });
});

describe('DCC eligibility', () => {
  const lex = fixLexicon();
  const by = dccBySection(lex);
  const ids = (n: number) => by.get(n)!.map((w) => w.lemma.id);

  it('merges words in both lists, keeping Wheelock spelling', () => {
    expect(lex.dccOnly.map((w) => w.lemma.id)).not.toContain('novus-adj12');
    expect(lex.byId.get('novus-adj12')!.origin).toBe('wheelock');
    expect(lex.byId.get('novus-adj12')!.lemma.gloss).toBe('new');
    expect(lex.byId.get('novus-adj12')!.lemma.dcc?.rank).toBe(2);
    // a noun "nova" is a different word (different paradigm), not a duplicate
    expect(lex.dccOnly.map((w) => w.lemma.id)).toContain('nova-n1');
    expect(matchKey(lex.byId.get('magnus-adj12')!.lemma)).toBe('magnus|adj12');
  });

  it('gates words until every needed feature is unlocked', () => {
    expect(firstEligibleSection(featuresNeeded(lex.byId.get('paro-v1')!.lemma))).toBe(1);
    expect(firstEligibleSection(featuresNeeded(lex.byId.get('aqua-n1')!.lemma))).toBe(2);
    expect(firstEligibleSection(featuresNeeded(lex.byId.get('equus-n2m')!.lemma))).toBe(3);
    expect(firstEligibleSection(featuresNeeded(lex.byId.get('caelum-n2n')!.lemma))).toBe(4);
    expect(firstEligibleSection(featuresNeeded(lex.byId.get('longus-adj12')!.lemma))).toBe(4);
    expect(ids(1)).not.toContain('aqua-n1');
    expect(ids(2)).toContain('aqua-n1');
    expect(ids(3)).toEqual(['equus-n2m']);
    expect(ids(4)).toEqual(expect.arrayContaining(['caelum-n2n', 'longus-adj12', 'magnus-adj12']));
  });

  it('caps at 12 per section by frequency; surplus carries to later sections', () => {
    expect(ids(1)).toHaveLength(MAX_DCC_PER_SECTION);
    expect(ids(1)[0]).toBe('paro-v1'); // highest-frequency eligible first
    expect(ids(2)).toEqual(expect.arrayContaining(['talo-v1', 'valo-v1', 'zalo-v1']));
    const all = [...by.values()].flat().map((w) => w.lemma.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('featuresAt accumulates across sections', () => {
    const f = featuresAt(3, false);
    expect(f.has('n1')).toBe(true);
    expect(f.has('n2m')).toBe(false);
    expect(featuresAt(3, true).has('n2m')).toBe(true);
  });
});
