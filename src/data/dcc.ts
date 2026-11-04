/**
 * DCC Latin Core Vocabulary → Lemma[].
 * Source data: Dickinson College Commentaries, https://dcc.dickinson.edu (CC BY-SA 3.0 Unported).
 *
 * DCC headwords abbreviate their citation forms ("terra -ae f.", "vocō -āre", "māgnus -a -um").
 * expandHeadword() rewrites them into the comma form the inference code reads
 * ("terra, terrae, f."), for the categories whose paradigms are implemented.
 */
import type { Lemma, PartOfSpeech } from '../morph/types.ts';
import { lemmaFromHeadword } from '../morph/lemma.ts';
import { citationMismatches } from '../morph/citation.ts';
import { isVowel, nfc, stripMacrons } from '../morph/phonology.ts';

export interface DccEntry { rank: number; headword: string; definition: string; pos: string; semantic_group: string }

/**
 * DCC part-of-speech labels whose paradigms exist so far, with the paradigm family each must land in.
 * `partial`: only some words of the label are implemented (sum, possum among the irregular verbs);
 * the rest are counted as skipped, not as problems.
 */
export const SUPPORTED: Record<string, { pos: PartOfSpeech; family: string[]; partial?: true }> = {
  'Noun: 1st Declension': { pos: 'noun', family: ['n1'] },
  'Noun: 2nd Declension': { pos: 'noun', family: ['n2m', 'n2n'] },
  'Noun: 3rd Declension': { pos: 'noun', family: ['n3', 'n3n', 'n3i', 'n3in'] },
  // nūllus, sōlus, tōtus, ūnus, alius, alter, ūllus: the -īus adjectives (recognized by name in infer.ts).
  'Adjective: 1st and 2nd Declension': { pos: 'adj', family: ['adj12', 'adj:ius'] },
  'Verb: 1st Conjugation': { pos: 'verb', family: ['v1'] },
  'Verb: 2nd Conjugation': { pos: 'verb', family: ['v2'] },
  'Verb: 3rd Conjugation -ō': { pos: 'verb', family: ['v3'] },
  'Verb: 3rd Conjugation -iō': { pos: 'verb', family: ['v3io'] },
  'Verb: 4th Conjugation': { pos: 'verb', family: ['v4'] },
  // tollō, tollere has a regular 3rd-conj. present system.
  'Verb: Irregular': { pos: 'verb', family: ['irr:sum', 'irr:possum', 'v3'], partial: true },
  // Only the demonstratives hic, ille, iste so far; other pronouns are skipped.
  'Pronoun': { pos: 'pron', family: ['pron:hic', 'pron:ille'], partial: true },
};

/**
 * DCC headwords corrected before expansion: abbreviations that cannot be expanded
 * mechanically, and missing or wrong macrons that would generate wrong forms.
 * Each fix is checked against Lewis & Short / Allen & Greenough.
 */
export const DCC_CORRECTIONS: Record<string, string> = {
  'senex -is m.': 'senex senis m.',                         // gen. senis is not "senex" + -is
  'lūmen luminis n.': 'lūmen lūminis n.',                   // ū in every case
  'tempestas -tātis f.': 'tempestās -tātis f.',             // nom. -ās like every -tās noun
  'cōnsuētūdo -inis f.': 'cōnsuētūdō -inis f.',             // nom. -ō
  'tellus tellūris f.': 'tellūs tellūris f.',               // nom. tellūs
  'respicio -ere -spēxī -spectum': 'respiciō -ere -spēxī -spectum',
  'deficiō -ficere -fēcī -fectum': 'dēficiō -ficere -fēcī -fectum',
  'īra irae f.': 'īra īrae f.',
  'parēns -ntis m./f.': 'parēns parentis m./f.',            // short e before nt in the oblique cases
  'ōrdō -īnis m.': 'ōrdō -inis m.',                         // ōrdinis, short i
};

const GENDER = /^(m|f|n)\.$/;
const COMMON = /^[mf]\.\/[mf]\.$/;

/**
 * Attach an abbreviated form ("-tinēre", "-gra", "-iī") to a base ("retineō", "integer", "convīvium"):
 * find where the tail's opening letters occur in the base (longest match first) and splice there.
 * `fromEnd` searches from the end (noun/adjective endings); otherwise from the start (verb prefixes).
 */
function attach(base: string, tail: string, fromEnd: boolean): string | null {
  const plain = stripMacrons(base.toLowerCase());
  const t = stripMacrons(tail.toLowerCase());
  for (let k = Math.min(3, t.length); k >= 1; k--) {
    const i = fromEnd ? plain.lastIndexOf(t.slice(0, k)) : plain.indexOf(t.slice(0, k));
    if (i > 0) return base.slice(0, i) + tail;
  }
  return null;
}

/** Expand a DCC headword for the given label. Returns null if the shape isn't recognized. */
/** Strip a 1sg ending to get the present base: dūcō → dūc, capiō → cap (when `io`). */
function verbBase(base: string, io: boolean): string | null {
  if (io && base.endsWith('iō')) return base.slice(0, -2);
  return base.endsWith('ō') ? base.slice(0, -1) : null;
}

/**
 * Expand a 3rd/4th-conj. infinitive tail ("-dere", "-cipere", "-venīre", "-ere") against the 1sg:
 * the tail minus -ere/-īre must end the 1sg's base (reddō + -dere → reddere, accipiō + -cipere → accipere).
 */
function verbTail34(base: string, tail: string, label: string): string | null {
  const m = /^(.*?)(ere|īre)$/.exec(tail);
  if (!m) return null;
  const [, body, end] = m as unknown as [string, string, string];
  const io = end === 'īre' || label.includes('-iō') || (body !== '' && base.endsWith('iō') && !label.includes('-ō'));
  for (const b of io ? [verbBase(base, true), verbBase(base, false)] : [verbBase(base, false)]) {
    if (b !== null && stripMacrons(b).endsWith(stripMacrons(body))) return b.slice(0, b.length - body.length) + tail;
  }
  return null;
}

/** Nominative endings replaced by a 3rd-decl. genitive tail (tempus -oris, nōmen -inis, ratiō -ōnis). */
const N3_NOM_END = /(us|en|ēs|es|is|ās|ūs|[oō]|s|x)$/;

/** Expand a 3rd-decl. genitive tail against the nominative. */
function genTail3(base: string, tail: string, plural: boolean): string | null {
  if (plural) {
    const m = /^(.*?)(ia|a|ēs)$/.exec(base);
    return m && /^(ium|um)$/.test(tail) ? m[1] + tail : null;
  }
  if (tail === 'is') {
    // parisyllabic: hostis -is, sēdēs -is, mare -is
    const m = /^(.*?)(is|ēs|e)$/.exec(base);
    return m ? m[1] + 'is' : null;
  }
  // Overlap the tail's first two letters with the nominative (amor -ōris, aetās -tātis, cōnsul -ulis),
  // or a single consonant (parēns -ntis, āgmen -minis); a single vowel is too ambiguous (cupīdō -inis).
  const plain = stripMacrons(base.toLowerCase());
  const t = stripMacrons(tail.toLowerCase());
  for (let k = Math.min(3, t.length); k >= 1; k--) {
    if (k === 1 && isVowel(t[0])) break;
    const i = plain.lastIndexOf(t.slice(0, k));
    if (i > 0 && i >= plain.length - 4) return base.slice(0, i) + tail; // only within the nominative's ending
  }
  const m = N3_NOM_END.exec(base);
  return m && m.index > 0 ? base.slice(0, m.index) + tail : null;
}

export function expandHeadword(raw: string, label: string): { headword: string; plural?: boolean } | null {
  const hw = nfc(DCC_CORRECTIONS[nfc(raw).trim()] ?? raw).replace(/\s*\([^)]*\)/g, '').replace(/:\s*$/, '').trim();
  const toks = hw.split(/\s+/).map((t) => t.replace(/:$/, ''));
  const [base, ...rest] = toks;
  if (!base) return null;
  const plural = rest.includes('pl.');
  const gender = rest.find((t) => GENDER.test(t) || COMMON.test(t));
  const forms = rest.filter((t) => !GENDER.test(t) && !COMMON.test(t) && t !== 'pl.');
  const full = (t: string): string | null => {
    if (!t.startsWith('-')) return t;
    const tail = t.slice(1);
    if (label.startsWith('Noun: 1st')) {
      if (!plural && tail === 'ae') return base.replace(/a$/, '') + tail;
      if (plural && tail === 'ārum') return base.replace(/ae$/, '') + tail;
      return attach(base, tail, true);
    }
    if (label.startsWith('Noun: 2nd')) {
      if (plural && tail === 'ōrum') return base.replace(/(a|ī)$/, '') + tail;
      const m = base.match(/^(.*?)(us|um)$/);
      if (m && tail === 'ī') return m[1] + tail;
      return attach(base, tail, true);
    }
    if (label.startsWith('Noun: 3rd')) return genTail3(base, tail, plural);
    if (label.startsWith('Adjective')) {
      const m = base.match(/^(.*?)(us|ī)$/);
      if (m && /^(a|um|ae|a)$/.test(tail)) return m[1] + tail;
      return attach(base, tail, true);
    }
    if (label.startsWith('Verb')) {
      if (tail === 'āre') return base.replace(/ō$/, '') + tail;
      if (tail === 'ēre') return base.replace(/eō$/, '') + tail;
      if (/[āē]re$/.test(tail)) return attach(base, tail, false);
      if (/(ere|īre)$/.test(tail)) return verbTail34(base, tail, label);
      return null; // perfect/supine abbreviations: not needed for the present system yet
    }
    return null;
  };
  const expanded: string[] = [base];
  for (const t of forms) {
    const f = full(t);
    if (f === null) {
      if (label.startsWith('Verb') && expanded.length >= 2) break; // keep present system only
      return null;
    }
    expanded.push(f);
  }
  if (gender) expanded.push(gender);
  return { headword: expanded.join(', '), ...(plural ? { plural } : {}) };
}

export interface DccImport {
  lemmas: Lemma[];
  skipped: { entry: DccEntry; reason: string }[];
  problems: { entry: DccEntry; reason: string }[];
}

export function importDcc(entries: DccEntry[]): DccImport {
  const out: DccImport = { lemmas: [], skipped: [], problems: [] };
  const ids = new Set<string>();
  for (const e of entries) {
    const sup = SUPPORTED[e.pos];
    if (!sup) { out.skipped.push({ entry: e, reason: `paradigm not implemented yet (${e.pos})` }); continue; }
    // paired entries such as "deus -ī m.; dea -ae f."
    const halves = nfc(e.headword).split(';').map((s) => s.trim()).filter(Boolean);
    for (const half of halves) {
      const label = halves.length < 2 ? e.pos
        : /\s-ae(?=\s|$)/.test(half) ? 'Noun: 1st Declension'
        : /\s-i?ī(?=\s|$)/.test(half) ? 'Noun: 2nd Declension' : e.pos;
      const ex = expandHeadword(half, label);
      const skip = (reason: string) => (sup.partial ? out.skipped : out.problems).push({ entry: e, reason });
      if (!ex) { skip(sup.partial ? `paradigm not implemented yet (${e.pos})` : `could not expand "${half}"`); continue; }
      const { lemma, inference } = lemmaFromHeadword(ex.headword, sup.pos, e.definition, [], {});
      if (!lemma) { skip(sup.partial ? `paradigm not implemented yet (${e.pos})` : `not classified: ${inference.reason ?? '?'} (${ex.headword})`); continue; }
      const fam = SUPPORTED[label]?.family ?? sup.family;
      if (!fam.includes(lemma.paradigm)) {
        skip(sup.partial ? `paradigm not implemented yet (${e.pos})` : `inferred ${lemma.paradigm}, DCC says ${label} (${ex.headword})`); continue;
      }
      if (inference.confidence !== 'high') {
        out.problems.push({ entry: e, reason: `low confidence: ${inference.reason ?? ''} (${ex.headword})` });
      }
      const mm = citationMismatches(lemma);
      if (mm.length) {
        out.problems.push({ entry: e, reason: `citation mismatch: ${mm.map((m) => `${m.printed} ≠ ${m.generated}`).join('; ')}` });
        continue;
      }
      lemma.dcc = { rank: e.rank, semanticGroup: e.semantic_group, headword: e.headword };
      // Homographs such as ōs, ōris "mouth" and os, ossis "bone" share a stripped first form and
      // paradigm; give the later one its genitive too ("os-ossis-n3n") so neither is lost.
      if (ids.has(lemma.id)) {
        const gen = (lemma.parts[1] ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, '');
        lemma.id = lemma.id.replace(/^([a-z]+)-/, `$1-${gen || 'b'}-`);
      }
      ids.add(lemma.id);
      out.lemmas.push(lemma);
    }
  }
  return out;
}
