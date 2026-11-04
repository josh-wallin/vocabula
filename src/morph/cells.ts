import type { AdjCell, Case, Gender, GramNumber, NounCell, Person, Tense, VerbCell } from './types.ts';

/** Canonical display order (Wheelock / A&G order: nom, gen, dat, acc, abl, voc). */
export const CASES: readonly Case[] = ['nom', 'gen', 'dat', 'acc', 'abl', 'voc'];
export const NUMBERS: readonly GramNumber[] = ['sg', 'pl'];
export const GENDERS: readonly Gender[] = ['m', 'f', 'n'];
export const PERSONS: readonly Person[] = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];

export const NOUN_CELLS: readonly NounCell[] = NUMBERS.flatMap((n) => CASES.map((c) => `${c}.${n}` as NounCell));

export const adjCells = (numbers: readonly GramNumber[] = NUMBERS): AdjCell[] =>
  GENDERS.flatMap((g) => numbers.flatMap((n) => CASES.map((c) => `${c}.${n}.${g}` as AdjCell)));

export const TENSES: readonly Tense[] = ['pres', 'fut', 'impf'];

/** The six finite cells of one indicative tense, in person order. */
export const tenseCells = (t: Tense): VerbCell[] => PERSONS.map((p) => `${t}.act.ind.${p}` as VerbCell);

export const VERB_CELLS: readonly VerbCell[] = [
  ...tenseCells('pres'),
  'pres.act.inf',
  'pres.act.imp.2sg',
  'pres.act.imp.2pl',
  ...tenseCells('fut'),
  ...tenseCells('impf'),
];

/** Tense of a finite verb cell, or null for non-finite / non-verb cells. */
export function tenseOf(cell: string): Tense | null {
  const m = /^(pres|fut|impf)\.act\.ind\./.exec(cell);
  return m ? (m[1] as Tense) : null;
}
