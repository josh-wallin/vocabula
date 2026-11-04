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
import { nfc, stripMacrons } from '../morph/phonology.ts';

export interface DccEntry { rank: number; headword: string; definition: string; pos: string; semantic_group: string }

/** DCC part-of-speech labels whose paradigms exist so far, with the paradigm family each must land in. */
export const SUPPORTED: Record<string, { pos: PartOfSpeech; family: string[] }> = {
  'Noun: 1st Declension': { pos: 'noun', family: ['n1'] },
  'Noun: 2nd Declension': { pos: 'noun', family: ['n2m', 'n2n'] },
  'Adjective: 1st and 2nd Declension': { pos: 'adj', family: ['adj12'] },
  'Verb: 1st Conjugation': { pos: 'verb', family: ['v1'] },
  'Verb: 2nd Conjugation': { pos: 'verb', family: ['v2'] },
};

const GENDER = /^(m|f|n)\.$/;

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
export function expandHeadword(raw: string, label: string): { headword: string; plural?: boolean } | null {
  const hw = nfc(raw).replace(/\s*\([^)]*\)/g, '').replace(/:\s*$/, '').trim();
  const toks = hw.split(/\s+/).map((t) => t.replace(/:$/, ''));
  const [base, ...rest] = toks;
  if (!base) return null;
  const plural = rest.includes('pl.');
  const gender = rest.find((t) => GENDER.test(t));
  const forms = rest.filter((t) => !GENDER.test(t) && t !== 'pl.');
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
    if (label.startsWith('Adjective')) {
      const m = base.match(/^(.*?)(us|ī)$/);
      if (m && /^(a|um|ae|a)$/.test(tail)) return m[1] + tail;
      return attach(base, tail, true);
    }
    if (label.startsWith('Verb')) {
      if (tail === 'āre') return base.replace(/ō$/, '') + tail;
      if (tail === 'ēre') return base.replace(/eō$/, '') + tail;
      if (/[āē]re$/.test(tail)) return attach(base, tail, false);
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
      if (!ex) { out.problems.push({ entry: e, reason: `could not expand "${half}"` }); continue; }
      const { lemma, inference } = lemmaFromHeadword(ex.headword, sup.pos, e.definition, [], {});
      if (!lemma) { out.problems.push({ entry: e, reason: `not classified: ${inference.reason ?? '?'} (${ex.headword})` }); continue; }
      const fam = SUPPORTED[label]?.family ?? sup.family;
      if (!fam.includes(lemma.paradigm)) {
        out.problems.push({ entry: e, reason: `inferred ${lemma.paradigm}, DCC says ${label} (${ex.headword})` }); continue;
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
      out.lemmas.push(lemma);
    }
  }
  return out;
}
