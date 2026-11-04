/**
 * Sections 5–8 (Wheelock chs. 5–8): data-driven appearance, feature gating,
 * DCC eligibility and lessons. Sections 1–4 must be unchanged.
 */
import { describe, expect, it } from 'vitest';
import { FIX_DCC, FIX_DCC_58, FIX_WHEELOCK, FIX_WHEELOCK_58, fixPath } from './fixtures.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { activeSections, buildPath, dccBySection } from '../src/engine/path.ts';
import {
  SECTIONS, featureOfCell, featuresAt, featuresNeeded, firstEligibleSection, type FeatureId,
} from '../src/engine/curriculum.ts';
import { buildLesson, hasClassQuestion, isGraded, type ChoiceExercise } from '../src/engine/lesson.ts';
import { replay } from '../src/engine/events.ts';
import { cellLabel, cellPrompt, optionLabeler } from '../src/engine/labels.ts';
import { L } from './helpers.ts';

const lex14 = () => buildLexicon(FIX_WHEELOCK, [...FIX_DCC, ...FIX_DCC_58]);
const lex18 = (extra = FIX_WHEELOCK_58) => buildLexicon([...FIX_WHEELOCK, ...extra], [...FIX_DCC, ...FIX_DCC_58]);
const ids = (p: ReturnType<typeof buildPath>, n: number) => p.sections.find((s) => s.spec.n === n)!.nodes.map((x) => x.id);

describe('sections 5–8 appear only when the pack has words for them', () => {
  it('a ch. 1–4 pack builds exactly the old path, even with later-paradigm DCC words available', () => {
    const p = buildPath(lex14());
    expect(p.sections.map((s) => s.spec.n)).toEqual([1, 2, 3, 4]);
    expect(p.nodes.map((n) => n.id)).toEqual(fixPath().nodes.map((n) => n.id));
    expect(p.nodes.map((n) => n.newWords)).toEqual(fixPath().nodes.map((n) => n.newWords));
    const taught = new Set(p.nodes.flatMap((n) => n.newWords));
    for (const l of FIX_DCC_58) expect(taught.has(l.id), l.id).toBe(false);
  });
  it('a ch. 1–8 pack builds sections 1–8 with the Probātiō moved to the end', () => {
    const p = buildPath(lex18());
    expect(p.sections.map((s) => s.spec.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ids(p, 4)).not.toContain('s4.probatio');
    expect(p.nodes[p.nodes.length - 1]!.id).toBe('s8.probatio');
    expect(ids(p, 5)).toEqual(['s5.verba.1', 's5.pattern', 's5.formae', 's5.rep.1']);
    expect(ids(p, 7)).toEqual(['s7.verba.1', 's7.pattern', 's7.formae', 's7.dcc.1', 's7.rep.1']);
  });
  it('sections 1–4 keep their node ids and words when later chapters are added (except the moved Probātiō)', () => {
    const before = fixPath().nodes.filter((n) => n.kind !== 'probatio');
    const after = buildPath(lex18()).nodes.filter((n) => n.section <= 4);
    expect(after.map((n) => [n.id, n.newWords, n.unlocked])).toEqual(before.map((n) => [n.id, n.newWords, n.unlocked]));
  });
  it('stops at the first chapter with no words (no gaps): ch. 5 and 7 but not 6 → sections 1–5', () => {
    const p = buildPath(lex18(FIX_WHEELOCK_58.filter((l) => l.sources[0]!.chapter !== 6)));
    expect(p.sections.map((s) => s.spec.n)).toEqual([1, 2, 3, 4, 5]);
    expect(activeSections(lex14()).map((s) => s.n)).toEqual([1, 2, 3, 4]);
  });
});

describe('features of sections 5–8', () => {
  it('each section unlocks its grammar at its pattern node', () => {
    expect(SECTIONS.slice(4, 8).map((s) => [s.n, s.chapter, s.paradigm])).toEqual([
      [5, 5, ['v12.fut', 'v12.impf']],
      [6, 6, ['sum.fut', 'sum.impf', 'possum.pres', 'possum.fut', 'possum.impf']],
      [7, 7, ['n3', 'n3n']],
      [8, 8, ['v3.ind', 'v3.inf', 'v3.imp', 'v3.fut', 'v3.impf']],
    ]);
    expect(featuresAt(4, true).has('v12.fut')).toBe(false);
    expect(featuresAt(5, false).has('v12.fut')).toBe(false);
    expect(featuresAt(5, true).has('v12.fut')).toBe(true);
    expect(featuresAt(8, false).has('conj3')).toBe(true);
    expect(featuresAt(8, false).has('v3.ind')).toBe(false);
  });
  it('sections 1–4 unlock exactly what they did before', () => {
    const old: Record<number, FeatureId[]> = {
      1: ['v12.ind', 'v12.inf', 'v12.imp', 'conj'],
      2: ['v12.ind', 'v12.inf', 'v12.imp', 'n1', 'adj.f', 'sum.3sg', 'conj', 'gender.mf'],
      3: ['v12.ind', 'v12.inf', 'v12.imp', 'n1', 'adj.f', 'sum.3sg', 'n2m', 'adj.m', 'conj', 'gender.mf'],
      4: ['v12.ind', 'v12.inf', 'v12.imp', 'n1', 'adj.f', 'sum.3sg', 'n2m', 'adj.m', 'n2n', 'adj.n', 'sum.pres', 'conj', 'gender.mf', 'gender.n'],
    };
    for (const n of [1, 2, 3, 4]) expect([...featuresAt(n, true)].sort(), `section ${n}`).toEqual([...old[n]!].sort());
  });
  it('maps every new cell to a feature', () => {
    const laudō = L('laudō, laudāre', 'verb');
    expect(featureOfCell(laudō, 'pres.act.ind.1sg')).toBe('v12.ind');
    expect(featureOfCell(laudō, 'fut.act.ind.1sg')).toBe('v12.fut');
    expect(featureOfCell(laudō, 'impf.act.ind.3pl')).toBe('v12.impf');
    const sum = L('sum, esse', 'verb');
    expect(featureOfCell(sum, 'pres.act.ind.3sg')).toBe('sum.3sg');
    expect(featureOfCell(sum, 'fut.act.ind.3sg')).toBe('sum.fut');
    expect(featureOfCell(sum, 'impf.act.ind.1sg')).toBe('sum.impf');
    const possum = L('possum, posse', 'verb');
    expect(featureOfCell(possum, 'pres.act.inf')).toBe('possum.pres');
    expect(featureOfCell(possum, 'fut.act.ind.1pl')).toBe('possum.fut');
    const agō = L('agō, agere', 'verb');
    expect(['pres.act.ind.1sg', 'pres.act.inf', 'pres.act.imp.2sg', 'fut.act.ind.1sg', 'impf.act.ind.1sg'].map((c) => featureOfCell(agō, c as never)))
      .toEqual(['v3.ind', 'v3.inf', 'v3.imp', 'v3.fut', 'v3.impf']);
    expect(featureOfCell(L('rēx, rēgis, m.', 'noun'), 'gen.pl')).toBe('n3');
    expect(featureOfCell(L('corpus, corporis, n.', 'noun'), 'gen.pl')).toBe('n3n');
    expect(featureOfCell(L('capiō, capere', 'verb'), 'fut.act.ind.1sg')).toBe('v3io.fut');
    expect(featureOfCell(L('urbs, urbis, f.', 'noun'), 'gen.pl')).toBe('n3i');
  });
  it('DCC eligibility: n3 → 7, v3 → 8, possum → 6; 3rd -iō, 4th and i-stems wait for later sections', () => {
    const f = (hw: string, pos: 'noun' | 'verb') => firstEligibleSection(featuresNeeded(L(hw, pos)));
    expect(f('pater, patris, m.', 'noun')).toBe(7);
    expect(f('nōmen, nōminis, n.', 'noun')).toBe(7);
    expect(f('mittō, mittere', 'verb')).toBe(8);
    expect(f('possum, posse', 'verb')).toBe(6);
    // 3rd -iō and 4th wait for section 10 (see curriculum910.test.ts); within sections 1–8 they are not eligible.
    const f8 = (hw: string) => firstEligibleSection(featuresNeeded(L(hw, 'verb')), SECTIONS.slice(0, 8));
    expect(f8('capiō, capere')).toBeNull();
    expect(f8('audiō, audīre')).toBeNull();
    expect(f('urbs, urbis, f.', 'noun')).toBeNull();
    expect(f('mare, maris, n.', 'noun')).toBeNull();
    // Limited to the sections a ch. 1–4 path has, nothing new is eligible.
    expect(firstEligibleSection(featuresNeeded(L('mittō, mittere', 'verb')), SECTIONS.slice(0, 4))).toBeNull();
    const by = dccBySection(lex18());
    expect(by.get(7)!.map((w) => w.lemma.id)).toEqual(['pater-n3', 'nomen-n3n']);
    expect(by.get(8)!.map((w) => w.lemma.id)).toEqual(['mitto-v3']);
    const all = [...by.values()].flat().map((w) => w.lemma.id);
    for (const id of ['capio-v3io', 'audio-v4', 'urbs-n3i', 'mare-n3in']) expect(all).not.toContain(id);
  });
  it('pattern drills reach back to earlier words with the new feature (sum in s6, ch. 1 verbs in s5)', () => {
    const p = buildPath(lex18());
    const pat = (n: number) => p.nodes.find((x) => x.id === `s${n}.pattern`)!;
    expect(pat(5).drill).toEqual(expect.arrayContaining(['supero-v1', 'maneo-v2', 'ambulo-v1']));
    expect(pat(5).drill).not.toContain('pulcher-adj12');
    expect(pat(6).drill).toEqual(expect.arrayContaining(['possum-irr-possum', 'sum-irr-sum']));
    expect(pat(7).drill).toEqual(['rex-n3', 'corpus-n3n', 'virtus-n3']);
    expect(pat(8).drill).toEqual(['ago-v3', 'duco-v3']);
  });
});

describe('lessons in sections 5–8', () => {
  const lex = lex18();
  const path = buildPath(lex);
  const ctxFor = (nodeId: string, extra: string[] = []) => {
    const node = path.nodes.find((n) => n.id === nodeId)!;
    return {
      node,
      ctx: {
        lex, path, state: { ...replay([]), seen: new Set(extra) }, now: new Date('2026-11-04T12:00:00Z'),
        unlocked: new Set<FeatureId>(node.unlocked), seed: nodeId,
      },
    };
  };
  for (const id of ['s5.pattern', 's6.pattern', 's7.pattern', 's8.pattern', 's8.formae']) {
    it(`${id} drills only its focus features, from known words`, () => {
      const { node, ctx } = ctxFor(id);
      const ex = buildLesson(node, ctx);
      const graded = ex.filter(isGraded);
      expect(graded.length).toBeGreaterThanOrEqual(8);
      for (const e of graded) {
        const feat = e.card.split(':')[2] as FeatureId;
        expect(node.focus, `${e.card}`).toContain(feat);
      }
      // every focus feature is drilled at least once
      for (const f of node.focus) {
        if (f === 'possum.impf' || f === 'sum.impf' || f === 'v3.inf' || f === 'v3.imp') continue; // small lessons may skip one
        expect(graded.some((e) => e.card.endsWith(`:${f}`)), f).toBe(true);
      }
    });
  }
  it('s5.pattern produces future/imperfect forms of 1st/2nd-conj. verbs', () => {
    const { node, ctx } = ctxFor('s5.pattern');
    const typed = buildLesson(node, ctx).filter((e) => e.type === 'typed');
    expect(typed.length).toBeGreaterThan(0);
    for (const e of typed) expect(e.accepted[0]).toMatch(/b(ō|is|it|imus|itis|unt|am|ās|at|āmus|ātis|ant)$/);
  });
  it('the conjugation question offers 3rd conjugation only from section 8', () => {
    const agō = lex.byId.get('ago-v3')!.lemma;
    expect(hasClassQuestion(agō, featuresAt(7, true))).toBe(false);
    expect(hasClassQuestion(agō, featuresAt(8, false))).toBe(true);
    const { node, ctx } = ctxFor('s8.verba.1');
    const conj = buildLesson(node, ctx).filter((e): e is ChoiceExercise => e.type === 'choice' && e.kind === 'conj');
    expect(conj.length).toBeGreaterThan(0);
    for (const q of conj) {
      expect(q.prompt).toBe('Which conjugation?');
      expect(q.options.map((o) => o.id)).toEqual(['1', '2', '3']);
    }
    const ago = conj.find((q) => q.lemma === 'ago-v3');
    if (ago) expect(ago.answer).toEqual(['3']);
  });
  it('before section 8 the conjugation question is unchanged', () => {
    const { node, ctx } = ctxFor('s1.verba.1');
    const conj = buildLesson(node, ctx).filter((e): e is ChoiceExercise => e.type === 'choice' && e.kind === 'conj');
    for (const q of conj) {
      expect(q.prompt).toBe('1st or 2nd conjugation?');
      expect(q.options.map((o) => o.id)).toEqual(['1', '2']);
    }
  });
});

describe('labels for the new cells', () => {
  it('present labels are unchanged; future and imperfect name the tense', () => {
    expect(cellLabel('pres.act.ind.3sg')).toBe('3rd person singular');
    expect(cellPrompt('pres.act.ind.3sg')).toBe('3rd person singular present');
    expect(cellLabel('fut.act.ind.1pl')).toBe('1st person plural future');
    expect(cellPrompt('impf.act.ind.2sg')).toBe('2nd person singular imperfect');
  });
  it('parse options name the present tense once other tenses are among them', () => {
    expect(optionLabeler(['pres.act.ind.1sg', 'pres.act.ind.2sg'])('pres.act.ind.1sg')).toBe('1st person singular');
    expect(optionLabeler(['pres.act.ind.1sg', 'fut.act.ind.1sg'])('pres.act.ind.1sg')).toBe('1st person singular present');
  });
});

describe('grammar cards for sections 5–8', () => {
  it('every section has a card, and every card table names words the morphology can build', async () => {
    const { GRAMMAR_CARDS, cardFor } = await import('../src/content/grammarCards.ts');
    const { generate } = await import('../src/morph/generate.ts');
    for (const s of SECTIONS) expect(cardFor(s.n), `section ${s.n}`).toBeDefined();
    for (const c of GRAMMAR_CARDS) {
      for (const b of c.blocks) {
        if (!('table' in b)) continue;
        const t = b.table;
        if (t.kind === 'gendered') {
          const l = L(t.headword, t.pos);
          for (const c of ['nom', 'gen', 'dat', 'acc', 'abl']) for (const n of ['sg', 'pl']) for (const g of ['m', 'f', 'n']) {
            expect(generate(l)[`${c}.${n}.${g}` as never], `${t.headword} ${c}.${n}.${g}`).toBeTruthy();
          }
          continue;
        }
        const hws = t.kind === 'noun' ? [t.headword] : t.kind === 'verbs' ? t.headwords : [t.headword ?? 'sum, esse'];
        for (const hw of hws) {
          const l = L(hw, t.kind === 'noun' ? 'noun' : 'verb');
          if (t.kind !== 'noun') {
            const tense = t.tense ?? 'pres';
            expect(generate(l)[`${tense}.act.ind.1sg`], `${hw} ${tense}`).toBeTruthy();
          }
        }
        if (t.kind === 'verbs') expect(t.glosses.length).toBe(t.headwords.length);
      }
    }
  });
});
