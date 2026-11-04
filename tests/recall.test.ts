/** English → Latin recall: which written answers count (recallAnswers / recallAccepted). */
import { describe, expect, it } from 'vitest';
import { recallAccepted, recallAnswers, recallHint } from '../src/engine/lesson.ts';
import { compareAnswer } from '../src/engine/util.ts';
import { checkTyped } from '../src/engine/session.ts';
import type { Lemma } from '../src/morph/types.ts';
import { L } from './helpers.ts';

const ok = (l: Lemma, typed: string, lex: { words: { lemma: Lemma }[] } = { words: [{ lemma: l }] }) => compareAnswer(typed, recallAccepted(l, lex as never));

describe('recall answers', () => {
  it('a verb: the first principal part, or the citation written out, never a bare infinitive', () => {
    const amo = L('amō, amāre, amāvī, amātum', 'verb', 'to love');
    expect(recallAnswers(amo)[0]).toBe('amō');
    for (const t of ['amō', 'amō, amāre', 'amo, amare', 'amō,amāre', 'amō , amāre', 'amō, amāre, amāvī, amātum', 'Amō, amāre.']) expect(ok(amo, t).ok, t).toBe(true);
    for (const t of ['amāre', 'amāvī', 'amō amāre', 'amō, amēre', 'amō, amāre, amātum']) expect(ok(amo, t).ok, t).toBe(false);
  });
  it('a noun: nominative alone, or nominative + genitive (with or without the gender)', () => {
    const rosa = L('rosa, rosae, f.', 'noun', 'rose');
    for (const t of ['rosa', 'rosa, rosae', 'rosa, rosae, f.', 'rosa, rosae, f']) expect(ok(rosa, t).ok, t).toBe(true);
    for (const t of ['rosae', 'rosa, rosārum', 'rosa, rosae, m.']) expect(ok(rosa, t).ok, t).toBe(false);
    const hostis = L('hostis, hostis, m./f.', 'noun', 'enemy');
    for (const t of ['hostis', 'hostis, hostis', 'hostis, hostis, m./f.']) expect(ok(hostis, t).ok, t).toBe(true);
  });
  it('an adjective: masculine nominative, or the three nominatives', () => {
    const magnus = L('magnus, magna, magnum', 'adj', 'large, great');
    for (const t of ['magnus', 'magnus, magna, magnum', 'magnus, magna']) expect(ok(magnus, t).ok, t).toBe(true);
    for (const t of ['magna', 'magnum']) expect(ok(magnus, t).ok, t).toBe(false);
  });
  it('printed variants: (or X) and X or Y', () => {
    const iuvo = L('iuvō (or adiuvō), iuvāre, iūvī, iūtum', 'verb', 'to help');
    expect(recallAnswers(iuvo)[0]).toBe('iuvō');
    for (const t of ['iuvō', 'adiuvō', 'iuvō, iuvāre']) expect(ok(iuvo, t).ok, t).toBe(true);
    const exe = L('ex or ē', 'prep', 'out of');
    expect(recallAnswers(exe)).toEqual(['ex', 'ē']);
    expect(ok(exe, 'e')).toMatchObject({ ok: true, macronMiss: true, expected: 'ē' });
  });
  it('enclitics without the hyphen; usage notes dropped', () => {
    expect(ok(L('-que', 'conj', 'and'), 'que').ok).toBe(true);
    expect(ok(L('-que', 'conj', 'and'), '-que').ok).toBe(true);
    const cum = L('cum + indic.', 'conj', 'when');
    expect(recallAnswers(cum)[0]).toBe('cum');
    expect(ok(cum, 'cum').ok).toBe(true);
  });
  it('a pair printed as one entry and imported as two words accepts either (same gloss, same hint)', () => {
    const ex: Lemma = { ...L('ex', 'prep', 'out of, from'), id: 'ex-indecl' };
    const e: Lemma = { ...L('ē', 'prep', 'out of, from'), id: 'e-indecl' };
    const nimis: Lemma = { ...L('nimis', 'adv', 'too, too much'), id: 'nimis-indecl' };
    const nimium: Lemma = { ...L('nimium', 'adv', 'too, too much'), id: 'nimium-indecl' };
    const lex = { words: [ex, e, nimis, nimium].map((lemma) => ({ lemma })) };
    expect(recallAccepted(ex, lex as never)).toEqual(['ex', 'ē']);
    expect(ok(ex, 'ē', lex).ok).toBe(true);
    expect(ok(nimium, 'nimis', lex).ok).toBe(true);
    expect(ok(ex, 'nimis', lex).ok).toBe(false);
  });
  it('same gloss but a different hint (gender, class, form) is not the same question', () => {
    const amicus = L('amīcus, amīcī, m.', 'noun', 'friend');
    const amica = L('amīca, amīcae, f.', 'noun', 'friend');
    expect(recallHint(amicus)).not.toBe(recallHint(amica));
    const lex = { words: [amicus, amica].map((lemma) => ({ lemma })) };
    expect(ok(amica, 'amīcus', lex).ok).toBe(false);
    expect(ok(amica, 'amīca, amīcae', lex).ok).toBe(true);
  });
  it('the session grades a typed recall with the macron reminder', () => {
    const amo = L('amō, amāre, amāvī, amātum', 'verb', 'to love');
    const ex = { id: 'x', type: 'typed', kind: 'recall', lemma: amo.id, card: `${amo.id}:recall`, prompt: '', cue: 'to love', cueLa: false, hint: '', accepted: recallAnswers(amo), note: '' } as const;
    expect(checkTyped(ex as never, 'amo, amare')).toEqual({ ok: true, macronMiss: true, expected: 'amō, amāre' });
    expect(checkTyped(ex as never, 'amāre')).toMatchObject({ ok: false, expected: 'amō' });
  });
});
