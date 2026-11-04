import type { AdjCell, Case, Gender, GramNumber, NounCell, Person, VerbCell } from './types.ts';

/** Canonical display order (Wheelock / A&G order: nom, gen, dat, acc, abl, voc). */
export const CASES: readonly Case[] = ['nom', 'gen', 'dat', 'acc', 'abl', 'voc'];
export const NUMBERS: readonly GramNumber[] = ['sg', 'pl'];
export const GENDERS: readonly Gender[] = ['m', 'f', 'n'];
export const PERSONS: readonly Person[] = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];

export const NOUN_CELLS: readonly NounCell[] = NUMBERS.flatMap((n) => CASES.map((c) => `${c}.${n}` as NounCell));

export const adjCells = (numbers: readonly GramNumber[] = NUMBERS): AdjCell[] =>
  GENDERS.flatMap((g) => numbers.flatMap((n) => CASES.map((c) => `${c}.${n}.${g}` as AdjCell)));

export const VERB_CELLS: readonly VerbCell[] = [
  ...PERSONS.map((p) => `pres.act.ind.${p}` as VerbCell),
  'pres.act.inf',
  'pres.act.imp.2sg',
  'pres.act.imp.2pl',
];
