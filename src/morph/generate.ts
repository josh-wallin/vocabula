import type { CellId, Lemma, Paradigm } from './types.ts';
import { adjCells, CASES, NOUN_CELLS, NUMBERS } from './cells.ts';
import { join, nfc } from './phonology.ts';

/** Endings per case, in CASES order (nom, gen, dat, acc, abl, voc). */
type Row = readonly [string, string, string, string, string, string];

const N1_SG: Row = ['a', 'ae', 'ae', 'am', 'ā', 'a'];
const N1_PL: Row = ['ae', 'ārum', 'īs', 'ās', 'īs', 'ae'];
const N2M_SG: Row = ['us', 'ī', 'ō', 'um', 'ō', 'e'];
const N2M_PL: Row = ['ī', 'ōrum', 'īs', 'ōs', 'īs', 'ī'];
const N2N_SG: Row = ['um', 'ī', 'ō', 'um', 'ō', 'um'];
const N2N_PL: Row = ['a', 'ōrum', 'īs', 'a', 'īs', 'a'];

const strip = (s: string, suffix: string): string | null =>
  s.endsWith(suffix) ? s.slice(0, s.length - suffix.length) : null;

function fill(out: Paradigm, stem: string, row: Row, num: 'sg' | 'pl', suffix = ''): void {
  CASES.forEach((c, i) => {
    out[`${c}.${num}${suffix}` as CellId] = join(stem, row[i]!);
  });
}

function need<T>(x: T | null | undefined, msg: string): T {
  if (x === null || x === undefined) throw new Error(msg);
  return x;
}

/* ---------------- nouns ---------------- */

function genN1(l: Lemma): Paradigm {
  const gen = nfc(need(l.parts[1], `${l.id}: missing genitive`));
  const stem = need(strip(gen, l.number === 'pl' ? 'ārum' : 'ae'), `${l.id}: 1st-decl genitive must end in -ae`);
  const out: Paradigm = {};
  if (l.number !== 'pl') fill(out, stem, N1_SG, 'sg');
  fill(out, stem, N1_PL, 'pl');
  return out;
}

function genN2m(l: Lemma): Paradigm {
  const nom = nfc(need(l.parts[0], `${l.id}: missing nominative`));
  const gen = nfc(need(l.parts[1], `${l.id}: missing genitive`));
  const stem = need(strip(gen, l.number === 'pl' ? 'ōrum' : 'ī'), `${l.id}: 2nd-decl genitive must end in -ī`);
  const out: Paradigm = {};
  if (l.number !== 'pl') {
    fill(out, stem, N2M_SG, 'sg');
    if (nom.endsWith('us')) {
      // -ius nouns: vocative in -ī (fīlī). Genitive stays fīliī (Wheelock's form).
      if (stem.endsWith('i')) out['voc.sg'] = stem.slice(0, -1) + 'ī';
    } else {
      // -er / -ir nouns (puer, ager, vir): nominative and vocative are the bare nominative.
      out['nom.sg'] = nom;
      out['voc.sg'] = nom;
    }
  }
  fill(out, stem, N2M_PL, 'pl');
  return out;
}

function genN2n(l: Lemma): Paradigm {
  const gen = nfc(need(l.parts[1], `${l.id}: missing genitive`));
  const stem = need(strip(gen, l.number === 'pl' ? 'ōrum' : 'ī'), `${l.id}: 2nd-decl genitive must end in -ī`);
  const out: Paradigm = {};
  if (l.number !== 'pl') fill(out, stem, N2N_SG, 'sg');
  fill(out, stem, N2N_PL, 'pl');
  return out;
}

/* ---------------- adjectives ---------------- */

/** Base of a 1st/2nd-declension adjective, found from the feminine (magna → magn-, pulchra → pulchr-). */
export function adj12Base(l: Lemma): string {
  const fem = nfc(need(l.parts[1], `${l.id}: missing feminine`));
  return need(strip(fem, l.number === 'pl' ? 'ae' : 'a'), `${l.id}: feminine must end in -a`);
}

function genAdj12(l: Lemma): Paradigm {
  const base = adj12Base(l);
  const masc = nfc(need(l.parts[0], `${l.id}: missing masculine`));
  const out: Paradigm = {};
  const nums = l.number === 'pl' ? (['pl'] as const) : NUMBERS;
  for (const num of nums) {
    fill(out, base, num === 'sg' ? N2M_SG : N2M_PL, num, '.m');
    fill(out, base, num === 'sg' ? N1_SG : N1_PL, num, '.f');
    fill(out, base, num === 'sg' ? N2N_SG : N2N_PL, num, '.n');
  }
  if (l.number !== 'pl' && !masc.endsWith('us')) {
    // -er types (līber, pulcher): masculine nom./voc. sg. is the printed masculine.
    out['nom.sg.m'] = masc;
    out['voc.sg.m'] = masc;
  }
  return out;
}

/* ---------------- verbs ---------------- */

/** Present stem from the infinitive: laudāre → laudā-, monēre → monē-, dare → da-. */
export function presentStem(l: Lemma): string {
  const inf = nfc(need(l.parts[1], `${l.id}: missing infinitive`));
  return need(strip(inf, 're'), `${l.id}: infinitive must end in -re`);
}

function genVerb(l: Lemma, conj: 1 | 2): Paradigm {
  const stem = presentStem(l);
  // 1st conj.: stem vowel contracts with -ō (laudā + ō → laudō, da + ō → dō).
  // 2nd conj.: stem vowel is kept and shortened before the vowel (monē + ō → moneō).
  const first = conj === 1 ? stem.slice(0, -1) + 'ō' : join(stem, 'ō');
  return {
    'pres.act.ind.1sg': first,
    'pres.act.ind.2sg': join(stem, 's'),
    'pres.act.ind.3sg': join(stem, 't'),
    'pres.act.ind.1pl': join(stem, 'mus'),
    'pres.act.ind.2pl': join(stem, 'tis'),
    'pres.act.ind.3pl': join(stem, 'nt'),
    'pres.act.inf': join(stem, 're'),
    'pres.act.imp.2sg': stem,
    'pres.act.imp.2pl': join(stem, 'te'),
  };
}

const SUM: Paradigm = {
  'pres.act.ind.1sg': 'sum',
  'pres.act.ind.2sg': 'es',
  'pres.act.ind.3sg': 'est',
  'pres.act.ind.1pl': 'sumus',
  'pres.act.ind.2pl': 'estis',
  'pres.act.ind.3pl': 'sunt',
  'pres.act.inf': 'esse',
};

/* ---------------- entry point ---------------- */

/** Generate every supported form of a lemma. Irregular overrides win over generated forms. */
export function generate(l: Lemma): Paradigm {
  let out: Paradigm;
  switch (l.paradigm) {
    case 'n1': out = genN1(l); break;
    case 'n2m': out = genN2m(l); break;
    case 'n2n': out = genN2n(l); break;
    case 'adj12': out = genAdj12(l); break;
    case 'v1': out = genVerb(l, 1); break;
    case 'v2': out = genVerb(l, 2); break;
    case 'irr:sum': out = { ...SUM }; break;
    case 'indecl': out = { citation: nfc(l.headword.split(',')[0]!.trim()) }; break;
  }
  if (l.irregular) {
    for (const [cell, form] of Object.entries(l.irregular)) {
      if (form !== undefined) out[cell as CellId] = nfc(form);
    }
  }
  return out;
}

/** Look up a single cell. */
export function form(l: Lemma, cell: CellId): string | undefined {
  return generate(l)[cell];
}

/** Cells a lemma's paradigm defines, in display order. */
export function cellsFor(l: Lemma): CellId[] {
  return Object.keys(generate(l)) as CellId[];
}

export { NOUN_CELLS, adjCells };
