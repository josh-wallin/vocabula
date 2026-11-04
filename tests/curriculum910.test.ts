/**
 * Sections 9–10 (Wheelock chs. 9–10): demonstratives and -īus adjectives; 4th conjugation
 * and 3rd -iō. Data-driven appearance, gating, DCC eligibility, lessons, cards.
 * Sections 1–8 must be unchanged.
 */
import { describe, expect, it } from 'vitest';
import { FIX_DCC, FIX_DCC_58, FIX_DCC_910, FIX_WHEELOCK, FIX_WHEELOCK_58, FIX_WHEELOCK_910 } from './fixtures.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { activeSections, buildPath, dccBySection } from '../src/engine/path.ts';
import {
  SECTIONS, featureOfCell, featuresAt, featuresNeeded, firstEligibleSection, type FeatureId,
} from '../src/engine/curriculum.ts';
import { buildLesson, hasClassQuestion, isGraded, type ChoiceExercise } from '../src/engine/lesson.ts';
import { replay } from '../src/engine/events.ts';
import { L } from './helpers.ts';

const DCC = [...FIX_DCC, ...FIX_DCC_58, ...FIX_DCC_910];
const lex18 = () => buildLexicon([...FIX_WHEELOCK, ...FIX_WHEELOCK_58], DCC);
const lex110 = (extra = FIX_WHEELOCK_910) => buildLexicon([...FIX_WHEELOCK, ...FIX_WHEELOCK_58, ...extra], DCC);
const ids = (p: ReturnType<typeof buildPath>, n: number) => p.sections.find((s) => s.spec.n === n)!.nodes.map((x) => x.id);

describe('sections 9–10 appear only when the pack has words for them', () => {
  it('a ch. 1–8 pack builds sections 1–8 only, and none of the ch. 9–10 DCC words', () => {
    const p = buildPath(lex18());
    expect(p.sections.map((s) => s.spec.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const taught = new Set(p.nodes.flatMap((n) => n.newWords));
    for (const l of FIX_DCC_910) expect(taught.has(l.id), l.id).toBe(false);
  });
  it('a ch. 1–10 pack builds sections 1–10 with the Probātiō at the end', () => {
    const p = buildPath(lex110());
    expect(p.sections.map((s) => s.spec.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ids(p, 8)).not.toContain('s8.probatio');
    expect(p.nodes[p.nodes.length - 1]!.id).toBe('s10.probatio');
    expect(ids(p, 9)).toEqual(['s9.verba.1', 's9.pattern', 's9.verba.2', 's9.rep.1', 's9.formae', 's9.dcc.1', 's9.rep.2']);
    expect(ids(p, 10)).toEqual(['s10.verba.1', 's10.pattern', 's10.formae', 's10.dcc.1', 's10.rep.1', 's10.probatio']);
  });
  it('sections 1–8 keep their node ids, words and unlocked features (except the moved Probātiō)', () => {
    const before = buildPath(lex18()).nodes.filter((n) => n.kind !== 'probatio');
    const after = buildPath(lex110()).nodes.filter((n) => n.section <= 8);
    expect(after.map((n) => [n.id, n.newWords, n.unlocked, n.drill])).toEqual(before.map((n) => [n.id, n.newWords, n.unlocked, n.drill]));
  });
  it('stops at the first chapter with no words: ch. 10 without ch. 9 → sections 1–8', () => {
    const p = buildPath(lex110(FIX_WHEELOCK_910.filter((l) => l.sources[0]!.chapter !== 9)));
    expect(p.sections.map((s) => s.spec.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(activeSections(lex110(FIX_WHEELOCK_910.filter((l) => l.sources[0]!.chapter === 9))).map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it('Verba lessons lead with the section’s paradigms (demonstratives, then the rest)', () => {
    const p = buildPath(lex110());
    const v = p.nodes.find((n) => n.id === 's9.verba.1')!;
    expect(v.newWords.slice(0, 4)).toEqual(['hic-pron-hic', 'ille-pron-ille', 'iste-pron-ille', 'solus-adj-ius']);
    expect(p.nodes.find((n) => n.id === 's10.verba.1')!.newWords.slice(0, 4)).toEqual(['audio-v4', 'capio-v3io', 'facio-v3io', 'venio-v4']);
  });
});

describe('features of sections 9–10', () => {
  it('section 9 unlocks the demonstratives and -īus cells; section 10 the 4th and 3rd -iō present systems', () => {
    expect(SECTIONS.slice(8).map((s) => [s.n, s.chapter, s.lexical, s.paradigm])).toEqual([
      [9, 9, [], ['pron.hic', 'pron.ille', 'adj.ius']],
      [10, 10, ['conj4'], ['v4.ind', 'v4.inf', 'v4.imp', 'v4.fut', 'v4.impf', 'v3io.ind', 'v3io.inf', 'v3io.imp', 'v3io.fut', 'v3io.impf']],
    ]);
    expect(featuresAt(8, true).has('pron.hic')).toBe(false);
    expect(featuresAt(9, false).has('pron.hic')).toBe(false);
    expect(featuresAt(9, true).has('adj.ius')).toBe(true);
    expect(featuresAt(10, false).has('conj4')).toBe(true);
    expect(featuresAt(10, false).has('v4.ind')).toBe(false);
    expect(featuresAt(10, true).has('v3io.impf')).toBe(true);
  });
  it('sections 1–8 unlock exactly what they did before', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const f = [...featuresAt(n, true)];
      expect(f.filter((x) => x.startsWith('pron.') || x === 'adj.ius' || x === 'conj4' || x.startsWith('v4.') || x.startsWith('v3io.')), `section ${n}`).toEqual([]);
    }
  });
  it('maps cells to features: demonstratives whole; -īus adjectives only gen./dat. sg. (and aliud)', () => {
    const hic = L('hic, haec, hoc', 'pron');
    expect(featureOfCell(hic, 'nom.sg.m')).toBe('pron.hic');
    expect(featureOfCell(hic, 'abl.pl.n')).toBe('pron.hic');
    expect(featureOfCell(L('iste, ista, istud', 'pron'), 'gen.sg.f')).toBe('pron.ille');
    const sōlus = L('sōlus, sōla, sōlum', 'adj');
    expect(featureOfCell(sōlus, 'gen.sg.m')).toBe('adj.ius');
    expect(featureOfCell(sōlus, 'dat.sg.f')).toBe('adj.ius');
    expect(featureOfCell(sōlus, 'acc.sg.f')).toBe('adj.f');
    expect(featureOfCell(sōlus, 'gen.pl.n')).toBe('adj.n');
    const alius = L('alius, alia, aliud', 'adj');
    expect(featureOfCell(alius, 'nom.sg.n')).toBe('adj.ius');
    expect(featureOfCell(alius, 'acc.sg.n')).toBe('adj.ius');
    expect(featureOfCell(alius, 'abl.sg.n')).toBe('adj.n');
    expect(featureOfCell(sōlus, 'nom.sg.n')).toBe('adj.n');
    const audiō = L('audiō, audīre', 'verb');
    expect(['pres.act.ind.1sg', 'pres.act.inf', 'pres.act.imp.2sg', 'fut.act.ind.1sg', 'impf.act.ind.1sg'].map((c) => featureOfCell(audiō, c as never)))
      .toEqual(['v4.ind', 'v4.inf', 'v4.imp', 'v4.fut', 'v4.impf']);
  });
  it('DCC eligibility: demonstratives and -īus adjectives → 9; 3rd -iō and 4th → 10; magnus still 4', () => {
    const f = (hw: string, pos: 'adj' | 'pron' | 'verb') => firstEligibleSection(featuresNeeded(L(hw, pos)));
    expect(f('hic, haec, hoc', 'pron')).toBe(9);
    expect(f('ille, illa, illud', 'pron')).toBe(9);
    expect(f('nūllus, nūlla, nūllum', 'adj')).toBe(9);
    expect(f('alter, altera, alterum', 'adj')).toBe(9);
    expect(f('capiō, capere', 'verb')).toBe(10);
    expect(f('audiō, audīre', 'verb')).toBe(10);
    expect(f('magnus, magna, magnum', 'adj')).toBe(4);
    const by = dccBySection(lex110());
    expect(by.get(9)!.map((w) => w.lemma.id)).toEqual(['nullus-adj-ius', 'totus-adj-ius']);
    expect(by.get(10)!.map((w) => w.lemma.id)).toEqual(['fugio-v3io', 'sentio-v4']);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) for (const w of by.get(n)!) expect(FIX_DCC_910.map((l) => l.id)).not.toContain(w.lemma.id);
  });
  it('a DCC duplicate of a Wheelock demonstrative merges into one word', () => {
    const lex = lex110();
    expect(lex.dccOnly.map((w) => w.lemma.id)).not.toContain('ille-pron-ille');
    expect(lex.byId.get('ille-pron-ille')!.lemma.dcc?.rank).toBe(62);
    expect(lex.byId.get('ille-pron-ille')!.lemma.gloss).toBe('that');
  });
  it('pattern drills: s9 the chapter’s demonstratives and -īus adjectives; s10 the new verbs', () => {
    const p = buildPath(lex110());
    const pat = (n: number) => p.nodes.find((x) => x.id === `s${n}.pattern`)!;
    expect(pat(9).drill).toEqual(['hic-pron-hic', 'ille-pron-ille', 'iste-pron-ille', 'solus-adj-ius', 'alius-adj-ius']);
    expect(pat(10).drill).toEqual(['audio-v4', 'capio-v3io', 'facio-v3io', 'venio-v4']);
  });
});

describe('lessons in sections 9–10', () => {
  const lex = lex110();
  const path = buildPath(lex);
  const ctxFor = (nodeId: string) => {
    const node = path.nodes.find((n) => n.id === nodeId)!;
    return {
      node,
      ctx: {
        lex, path, state: { ...replay([]), seen: new Set<string>() }, now: new Date('2026-11-04T12:00:00Z'),
        unlocked: new Set<FeatureId>(node.unlocked), seed: nodeId,
      },
    };
  };
  for (const id of ['s9.pattern', 's9.formae', 's10.pattern', 's10.formae']) {
    it(`${id} drills only its focus features, and each at least once`, () => {
      const { node, ctx } = ctxFor(id);
      const graded = buildLesson(node, ctx).filter(isGraded);
      expect(graded.length).toBeGreaterThanOrEqual(8);
      for (const e of graded) expect(node.focus, e.card).toContain(e.card.split(':')[2]);
      const small = new Set(['v4.inf', 'v4.imp', 'v3io.inf', 'v3io.imp', 'v4.impf', 'v3io.impf', 'v4.fut', 'v3io.fut']);
      for (const f of node.focus) if (!small.has(f)) expect(graded.some((e) => e.card.endsWith(`:${f}`)), f).toBe(true);
    });
  }
  it('s9 forms questions on -īus adjectives ask for the genitive/dative singular (or aliud)', () => {
    const { node, ctx } = ctxFor('s9.pattern');
    const ius = buildLesson(node, ctx).filter(isGraded).filter((e) => e.card.endsWith(':adj.ius'));
    expect(ius.length).toBeGreaterThan(0);
    for (const e of ius) {
      const forms = e.type === 'typed' ? e.accepted : [e.cue];
      for (const f of forms) expect(f).toMatch(/(īus|ī|aliud)$/);
    }
  });
  it('a parse of huic or illī accepts every analysis', () => {
    const { node, ctx } = ctxFor('s9.formae');
    for (let k = 0; k < 20; k++) {
      const ex = buildLesson(node, { ...ctx, seed: `s9.formae#${k}` });
      for (const e of ex) {
        if (e.type !== 'choice' || e.kind !== 'parse') continue;
        if (e.cue === 'huic') expect(e.answer.sort()).toEqual(['dat.sg.f', 'dat.sg.m', 'dat.sg.n']);
        if (e.cue === 'illī') expect(e.answer.sort()).toEqual(['dat.sg.f', 'dat.sg.m', 'dat.sg.n', 'nom.pl.m']);
        if (e.cue === 'haec') expect(e.answer.sort()).toEqual(['acc.pl.n', 'nom.pl.n', 'nom.sg.f']);
      }
    }
  });
  it('the conjugation question has five options from section 10; 3rd -iō is its own answer', () => {
    const capiō = lex.byId.get('capio-v3io')!.lemma;
    expect(hasClassQuestion(capiō, featuresAt(9, true))).toBe(false);
    expect(hasClassQuestion(capiō, featuresAt(10, false))).toBe(true);
    const all: ChoiceExercise[] = [];
    for (let k = 0; k < 6; k++) {
      const { node, ctx } = ctxFor('s10.verba.1');
      all.push(...buildLesson(node, { ...ctx, seed: `s10#${k}` }).filter((e): e is ChoiceExercise => e.type === 'choice' && e.kind === 'conj'));
    }
    expect(all.length).toBeGreaterThan(0);
    const answers: Record<string, string> = { 'audio-v4': '4', 'capio-v3io': '3io', 'facio-v3io': '3io', 'venio-v4': '4', 'vivo-v3': '3' };
    for (const q of all) {
      expect(q.prompt).toBe('Which conjugation?');
      expect(q.options.map((o) => o.id)).toEqual(['1', '2', '3', '3io', '4']);
      expect(q.options.map((o) => o.text)).toContain('3rd conjugation -iō');
      if (answers[q.lemma]) expect(q.answer, q.lemma).toEqual([answers[q.lemma]]);
    }
  });
  it('in section 9 the conjugation question still has three options', () => {
    const { node, ctx } = ctxFor('s9.verba.1');
    const agō = lex.byId.get('ago-v3')!.lemma;
    expect(hasClassQuestion(agō, featuresAt(9, true))).toBe(true);
    for (const e of buildLesson(node, ctx)) {
      if (e.type === 'choice' && e.kind === 'conj') expect(e.options.map((o) => o.id)).toEqual(['1', '2', '3']);
    }
  });
});

describe('grammar cards and glossary for sections 9–10', () => {
  it('cards exist; the glossary defines every term they link', async () => {
    const { cardFor, termsIn } = await import('../src/content/grammarCards.ts');
    const { glossaryById } = await import('../src/content/glossary.ts');
    for (const n of [9, 10]) {
      const c = cardFor(n)!;
      expect(c).toBeDefined();
      for (const t of termsIn(c)) {
        expect(glossaryById.has(t), t).toBe(true);
        expect(glossaryById.get(t)!.section, t).toBeLessThanOrEqual(n);
      }
    }
    expect(glossaryById.get('demonstrative')!.section).toBe(9);
    expect(glossaryById.get('pronoun')!.section).toBe(9);
  });
});
