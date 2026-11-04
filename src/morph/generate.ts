import type { CellId, Lemma, Paradigm, Tense } from './types.ts';
import { adjCells, CASES, NOUN_CELLS, NUMBERS, tenseCells } from './cells.ts';
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

/* 3rd declension. Nominative (and vocative, and neuter accusative) singular is the
 * printed nominative; every other case is the base (genitive minus -is) + ending. */
const N3_SG: Row = ['', 'is', 'ī', 'em', 'e', ''];
const N3_PL: Row = ['ēs', 'um', 'ibus', 'ēs', 'ibus', 'ēs'];
const N3N_SG: Row = ['', 'is', 'ī', '', 'e', ''];
const N3N_PL: Row = ['a', 'um', 'ibus', 'a', 'ibus', 'a'];
/** i-stems (Wheelock ch. 14): m./f. differ only in gen. pl. -ium; neuters have abl. sg. -ī, -ia, -ium. */
const N3I_PL: Row = ['ēs', 'ium', 'ibus', 'ēs', 'ibus', 'ēs'];
const N3IN_SG: Row = ['', 'is', 'ī', '', 'ī', ''];
const N3IN_PL: Row = ['ia', 'ium', 'ibus', 'ia', 'ibus', 'ia'];

/** Base of a 3rd-declension noun, from the genitive: rēgis → rēg-, corporis → corpor-, (pl.) moenium → moen-. */
export function n3Base(l: Lemma): string {
  const gen = nfc(need(l.parts[1], `${l.id}: missing genitive`));
  if (l.number === 'pl') {
    const i = l.paradigm === 'n3i' || l.paradigm === 'n3in';
    return need(strip(gen, i ? 'ium' : 'um'), `${l.id}: 3rd-decl genitive plural must end in ${i ? '-ium' : '-um'}`);
  }
  return need(strip(gen, 'is'), `${l.id}: 3rd-decl genitive must end in -is`);
}

function genN3(l: Lemma): Paradigm {
  const base = n3Base(l);
  const neuter = l.paradigm === 'n3n' || l.paradigm === 'n3in';
  const iStem = l.paradigm === 'n3i' || l.paradigm === 'n3in';
  const sg = l.paradigm === 'n3in' ? N3IN_SG : neuter ? N3N_SG : N3_SG;
  const pl = l.paradigm === 'n3in' ? N3IN_PL : neuter ? N3N_PL : iStem ? N3I_PL : N3_PL;
  const out: Paradigm = {};
  if (l.number !== 'pl') {
    const nom = nfc(need(l.parts[0], `${l.id}: missing nominative`));
    fill(out, base, sg, 'sg');
    out['nom.sg'] = nom;
    out['voc.sg'] = nom;
    if (neuter) out['acc.sg'] = nom;
  }
  fill(out, base, pl, 'pl');
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

/* ---------------- pronominal declension (Wheelock ch. 9) ---------------- */

/** Endings for nom, gen, dat, acc, abl (these words have no vocative). */
type Row5 = readonly [string, string, string, string, string];
const CASES5 = CASES.slice(0, 5);

function fill5(out: Paradigm, stem: string, row: Row5, num: 'sg' | 'pl', g: 'm' | 'f' | 'n'): void {
  CASES5.forEach((c, i) => { out[`${c}.${num}.${g}` as CellId] = join(stem, row[i]!); });
}

/** Plural of the pronominal declension: exactly like bonus, minus the vocative. */
const PL_M: Row5 = ['ī', 'ōrum', 'īs', 'ōs', 'īs'];
const PL_F: Row5 = ['ae', 'ārum', 'īs', 'ās', 'īs'];
const PL_N: Row5 = ['a', 'ōrum', 'īs', 'a', 'īs'];

/**
 * The -īus adjectives (A&G §113; Wheelock ch. 9): gen. sg. -īus and dat. sg. -ī in every gender,
 * otherwise like magnus / pulcher. alius has neuter aliud; its genitive is normally supplied by
 * alterīus (alīus is rare), so alius gets no gen. sg. cells. Vocatives are not generated.
 */
function genAdjIus(l: Lemma): Paradigm {
  const base = adj12Base(l);
  const masc = nfc(need(l.parts[0], `${l.id}: missing masculine`));
  const neut = nfc(need(l.parts[2], `${l.id}: missing neuter`));
  const alius = neut === base + 'ud';
  const out: Paradigm = {};
  fill5(out, base, ['us', 'īus', 'ī', 'um', 'ō'], 'sg', 'm');
  fill5(out, base, ['a', 'īus', 'ī', 'am', 'ā'], 'sg', 'f');
  fill5(out, base, [alius ? 'ud' : 'um', 'īus', 'ī', alius ? 'ud' : 'um', 'ō'], 'sg', 'n');
  if (!masc.endsWith('us')) out['nom.sg.m'] = masc; // alter, neuter, uter
  if (alius) for (const g of ['m', 'f', 'n'] as const) delete out[`gen.sg.${g}`];
  fill5(out, base, PL_M, 'pl', 'm');
  fill5(out, base, PL_F, 'pl', 'f');
  fill5(out, base, PL_N, 'pl', 'n');
  return out;
}

/** ille, illa, illud / iste, ista, istud (A&G §146): base from the feminine (ill-, ist-). */
function genIlle(l: Lemma): Paradigm {
  const base = adj12Base(l);
  const out: Paradigm = {};
  fill5(out, base, ['e', 'īus', 'ī', 'um', 'ō'], 'sg', 'm');
  fill5(out, base, ['a', 'īus', 'ī', 'am', 'ā'], 'sg', 'f');
  fill5(out, base, ['ud', 'īus', 'ī', 'ud', 'ō'], 'sg', 'n');
  fill5(out, base, PL_M, 'pl', 'm');
  fill5(out, base, PL_F, 'pl', 'f');
  fill5(out, base, PL_N, 'pl', 'n');
  return out;
}

/** hic, haec, hoc (A&G §146; Wheelock ch. 9). Wheelock prints hic, hoc, huius, huic without macrons. */
const HIC: Paradigm = (() => {
  const out: Paradigm = {};
  const put5 = (num: 'sg' | 'pl', g: 'm' | 'f' | 'n', forms: Row5) =>
    CASES5.forEach((c, i) => { out[`${c}.${num}.${g}` as CellId] = forms[i]!; });
  put5('sg', 'm', ['hic', 'huius', 'huic', 'hunc', 'hōc']);
  put5('sg', 'f', ['haec', 'huius', 'huic', 'hanc', 'hāc']);
  put5('sg', 'n', ['hoc', 'huius', 'huic', 'hoc', 'hōc']);
  put5('pl', 'm', ['hī', 'hōrum', 'hīs', 'hōs', 'hīs']);
  put5('pl', 'f', ['hae', 'hārum', 'hīs', 'hās', 'hīs']);
  put5('pl', 'n', ['haec', 'hōrum', 'hīs', 'haec', 'hīs']);
  return out;
})();

/* ---------------- verbs ---------------- */

/** Present stem from the infinitive: laudāre → laudā-, monēre → monē-, dare → da-. */
export function presentStem(l: Lemma): string {
  const inf = nfc(need(l.parts[1], `${l.id}: missing infinitive`));
  return need(strip(inf, 're'), `${l.id}: infinitive must end in -re`);
}

type Row6 = readonly [string, string, string, string, string, string];

function put(out: Paradigm, tense: Tense, stem: string, endings: Row6, prefix = ''): void {
  tenseCells(tense).forEach((c, i) => { out[c] = join(stem, prefix + endings[i]!); });
}

const V12_PRES: Row6 = ['ō', 's', 't', 'mus', 'tis', 'nt'];
const V12_FUT: Row6 = ['bō', 'bis', 'bit', 'bimus', 'bitis', 'bunt'];
/** Imperfect -ba- (all conjugations): -bam, -bās, -bat, -bāmus, -bātis, -bant. */
const IMPF: Row6 = ['bam', 'bās', 'bat', 'bāmus', 'bātis', 'bant'];
const V3_PRES: Row6 = ['ō', 'is', 'it', 'imus', 'itis', 'unt'];
const V3IO_PRES: Row6 = ['iō', 'is', 'it', 'imus', 'itis', 'iunt'];
const V4_PRES: Row6 = ['ō', 's', 't', 'mus', 'tis', 'unt'];
/** Future of the 3rd and 4th conjugations: -am, -ēs, -et, -ēmus, -ētis, -ent. */
const V34_FUT: Row6 = ['am', 'ēs', 'et', 'ēmus', 'ētis', 'ent'];

function genVerb(l: Lemma, conj: 1 | 2): Paradigm {
  const stem = presentStem(l);
  const out: Paradigm = {};
  put(out, 'pres', stem, V12_PRES);
  // 1st conj.: stem vowel contracts with -ō (laudā + ō → laudō, da + ō → dō).
  // 2nd conj.: stem vowel is kept and shortened before the vowel (monē + ō → moneō).
  if (conj === 1) out['pres.act.ind.1sg'] = stem.slice(0, -1) + 'ō';
  out['pres.act.inf'] = join(stem, 're');
  out['pres.act.imp.2sg'] = stem;
  out['pres.act.imp.2pl'] = join(stem, 'te');
  put(out, 'fut', stem, V12_FUT);   // laudābō, monēbō
  put(out, 'impf', stem, IMPF);     // laudābam, monēbam
  return out;
}

/** Consonant base of a 3rd-conjugation verb: agere → ag-, capere → cap-. */
export function v3Base(l: Lemma): string {
  const inf = nfc(need(l.parts[1], `${l.id}: missing infinitive`));
  return need(strip(inf, 'ere'), `${l.id}: 3rd-conj. infinitive must end in -ere`);
}

function genVerb3(l: Lemma, io: boolean): Paradigm {
  const base = v3Base(l);
  const out: Paradigm = {};
  put(out, 'pres', base, io ? V3IO_PRES : V3_PRES);
  out['pres.act.inf'] = base + 'ere';
  out['pres.act.imp.2sg'] = base + 'e';
  out['pres.act.imp.2pl'] = base + 'ite';
  put(out, 'fut', base, V34_FUT, io ? 'i' : '');      // agam, agēs / capiam, capiēs
  put(out, 'impf', base, IMPF, io ? 'iē' : 'ē');      // agēbam / capiēbam
  return out;
}

function genVerb4(l: Lemma): Paradigm {
  const stem = presentStem(l); // audī-
  const out: Paradigm = {};
  // join() shortens ī before a vowel and before final -t / nt: audiō, audit, audiunt, audiam, audiēbam.
  put(out, 'pres', stem, V4_PRES);
  out['pres.act.inf'] = join(stem, 're');
  out['pres.act.imp.2sg'] = stem;
  out['pres.act.imp.2pl'] = join(stem, 'te');
  put(out, 'fut', stem, V34_FUT);
  put(out, 'impf', stem, IMPF, 'ē');
  return out;
}

const SUM: Paradigm = {
  'pres.act.ind.1sg': 'sum',
  'pres.act.ind.2sg': 'es',
  'pres.act.ind.3sg': 'est',
  'pres.act.ind.1pl': 'sumus',
  'pres.act.ind.2pl': 'estis',
  'pres.act.ind.3pl': 'sunt',
  'pres.act.inf': 'esse',
  'fut.act.ind.1sg': 'erō',
  'fut.act.ind.2sg': 'eris',
  'fut.act.ind.3sg': 'erit',
  'fut.act.ind.1pl': 'erimus',
  'fut.act.ind.2pl': 'eritis',
  'fut.act.ind.3pl': 'erunt',
  'impf.act.ind.1sg': 'eram',
  'impf.act.ind.2sg': 'erās',
  'impf.act.ind.3sg': 'erat',
  'impf.act.ind.1pl': 'erāmus',
  'impf.act.ind.2pl': 'erātis',
  'impf.act.ind.3pl': 'erant',
};

/** possum = pot- + sum; pot- becomes pos- before s (possum, possunt), and the infinitive is posse. */
const POSSUM: Paradigm = Object.fromEntries(
  Object.entries(SUM).map(([cell, f]) => [cell, cell === 'pres.act.inf' ? 'posse' : (f!.startsWith('s') ? 'pos' : 'pot') + f]),
);

/* ---------------- entry point ---------------- */

/** Generate every supported form of a lemma. Irregular overrides win over generated forms. */
export function generate(l: Lemma): Paradigm {
  let out: Paradigm;
  switch (l.paradigm) {
    case 'n1': out = genN1(l); break;
    case 'n2m': out = genN2m(l); break;
    case 'n2n': out = genN2n(l); break;
    case 'n3': case 'n3n': case 'n3i': case 'n3in': out = genN3(l); break;
    case 'adj12': out = genAdj12(l); break;
    case 'adj:ius': out = genAdjIus(l); break;
    case 'pron:hic': out = { ...HIC }; break;
    case 'pron:ille': out = genIlle(l); break;
    case 'v1': out = genVerb(l, 1); break;
    case 'v2': out = genVerb(l, 2); break;
    case 'v3': out = genVerb3(l, false); break;
    case 'v3io': out = genVerb3(l, true); break;
    case 'v4': out = genVerb4(l); break;
    case 'irr:sum': out = { ...SUM }; break;
    case 'irr:possum': out = { ...POSSUM }; break;
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
