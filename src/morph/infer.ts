import type { Gender, Lemma, ParadigmId, PartOfSpeech } from './types.ts';
import { KNOWN_IRREGULAR } from './irregulars.ts';
import { nfc } from './phonology.ts';

export type Confidence = 'high' | 'low' | 'none';

export interface Inference {
  paradigm: ParadigmId | null;
  /** Inflectional stem/base (e.g. "agr", "laudā", "magn"); null if not determined. */
  stem: string | null;
  /** Cleaned citation forms (no gender tags, no parentheticals). */
  parts: string[];
  gender?: Gender;
  number?: 'pl';
  irregular?: Lemma['irregular'];
  confidence: Confidence;
  /** Why confidence is not 'high' (or a note about what was detected). */
  reason?: string;
}

export interface InferHints {
  gender?: Gender | null;
  /** e.g. "indeclinable" from the source list. */
  declension?: string | null;
}

const GENDER_TOKENS: Record<string, Gender> = { 'm.': 'm', 'f.': 'f', 'n.': 'n' };
const NON_INFLECTING: PartOfSpeech[] = ['adv', 'conj', 'prep', 'interj'];

/** Split a printed headword into citation forms and a gender tag. */
export function parseHeadword(headword: string): { parts: string[]; gender?: Gender; indeclinable: boolean } {
  const cleaned = nfc(headword).replace(/\([^)]*\)/g, ' ');
  let gender: Gender | undefined;
  let indeclinable = false;
  const parts: string[] = [];
  for (const raw of cleaned.split(',')) {
    const t = raw.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (t in GENDER_TOKENS) { gender = GENDER_TOKENS[t]; continue; }
    if (/^indecl(inable|\.)?$/i.test(t)) { indeclinable = true; continue; }
    parts.push(t);
  }
  return gender ? { parts, gender, indeclinable } : { parts, indeclinable };
}

const none = (parts: string[], reason: string, gender?: Gender): Inference =>
  ({ paradigm: null, stem: null, parts, confidence: 'none', reason, ...(gender ? { gender } : {}) });

/**
 * Infer the paradigm and stem of a dictionary entry.
 * Examples: "porta, portae, f." → n1; "ager, agrī, m." → n2m (agr-);
 * "laudō, laudāre, laudāvī, laudātum" → v1; "magnus, magna, magnum" → adj12.
 */
export function inferParadigm(headword: string, pos: PartOfSpeech, hints: InferHints = {}): Inference {
  const parsed = parseHeadword(headword);
  const parts = parsed.parts;
  const gender = parsed.gender ?? hints.gender ?? undefined;
  const p0 = parts[0];
  if (!p0) return none(parts, 'empty headword');
  const irr = KNOWN_IRREGULAR[p0]?.cells;
  const withIrr = (inf: Inference): Inference => (irr ? { ...inf, irregular: { ...irr } } : inf);

  if (parsed.indeclinable || /^indecl/i.test(hints.declension ?? '')) {
    return { paradigm: 'indecl', stem: null, parts, confidence: 'high', ...(gender ? { gender } : {}) };
  }
  if (NON_INFLECTING.includes(pos)) {
    return { paradigm: 'indecl', stem: null, parts, confidence: 'high' };
  }

  switch (pos) {
    case 'verb': return withIrr(inferVerb(parts));
    case 'noun': return withIrr(inferNoun(parts, gender));
    case 'adj': return withIrr(inferAdj(parts));
    default: return none(parts, `paradigms for part of speech "${pos}" are not implemented yet`);
  }
}

function inferVerb(parts: string[]): Inference {
  const [p0, p1] = parts as [string, string | undefined];
  if (p0 === 'sum' && p1 === 'esse') return { paradigm: 'irr:sum', stem: null, parts, confidence: 'high' };
  if (!p1) return none(parts, `"${p0}" has no infinitive; not a dictionary headword (maybe an inflected form)`);
  if (p1.endsWith('āre') && p0.endsWith('ō')) {
    const stem = p1.slice(0, -2);
    if (p0.slice(0, -1) !== stem.slice(0, -1)) return { ...none(parts, `1sg ${p0} and infinitive ${p1} have different stems`), paradigm: 'v1', stem, confidence: 'low' };
    return { paradigm: 'v1', stem, parts, confidence: 'high' };
  }
  if (p1.endsWith('are') && p0.endsWith('ō')) {
    // dō, dare: 1st conj. with short stem vowel.
    const stem = p1.slice(0, -2);
    const ok = KNOWN_IRREGULAR[p0] !== undefined;
    return { paradigm: 'v1', stem, parts, confidence: ok ? 'high' : 'low',
      reason: ok ? 'short-vowel 1st conj.; known irregular overrides applied'
                 : `short-a infinitive ${p1}: vowel lengths are irregular, add overrides` };
  }
  if (p1.endsWith('ēre') && p0.endsWith('eō')) {
    const stem = p1.slice(0, -2);
    if (p0.slice(0, -2) !== stem.slice(0, -1)) return { paradigm: 'v2', stem, parts, confidence: 'low', reason: `1sg ${p0} and infinitive ${p1} have different stems` };
    return { paradigm: 'v2', stem, parts, confidence: 'high' };
  }
  if (p1.endsWith('ere')) return none(parts, `infinitive ${p1} (short -ere): 3rd conjugation, not implemented yet`);
  if (p1.endsWith('īre')) return none(parts, `infinitive ${p1}: 4th conjugation, not implemented yet`);
  return none(parts, `cannot classify verb ${p0}, ${p1}`);
}

function inferNoun(parts: string[], gender: Gender | undefined): Inference {
  const [nom, gen] = parts as [string, string | undefined];
  const g = gender ? { gender } : {};
  if (!gen) return none(parts, `noun "${nom}" has no genitive`, gender);
  if (gen.endsWith('ae')) {
    const stem = gen.slice(0, -2);
    if (nom !== stem + 'a') return { paradigm: 'n1', stem, parts, ...g, confidence: 'low', reason: `nom. ${nom} does not match gen. ${gen}` };
    return { paradigm: 'n1', stem, parts, ...g, confidence: gender ? 'high' : 'low', ...(gender ? {} : { reason: 'gender not given' }) };
  }
  if (gen.endsWith('ārum') && nom.endsWith('ae')) {
    return { paradigm: 'n1', stem: gen.slice(0, -4), parts, ...g, number: 'pl', confidence: 'high' };
  }
  if ((gen.endsWith('ēī') || gen.endsWith('eī')) && nom.endsWith('ēs')) return none(parts, `genitive ${gen}: 5th declension, not implemented yet`, gender);
  if (gen.endsWith('ī')) {
    const stem = gen.slice(0, -1);
    if (nom.endsWith('um')) {
      const ok = nom === stem + 'um';
      const conf: Confidence = ok && gender === 'n' ? 'high' : 'low';
      return { paradigm: 'n2n', stem, parts, gender: gender ?? 'n', confidence: conf,
        ...(conf === 'low' ? { reason: ok ? `-um noun with gender ${gender ?? 'missing'}` : `nom. ${nom} does not match gen. ${gen}` } : {}) };
    }
    let ok = false;
    let reason = '';
    if (nom.endsWith('us')) { ok = nom === stem + 'us'; reason = 'nom. -us does not match gen. stem'; }
    else if (nom.endsWith('er')) {
      ok = nom === stem || nom === stem.slice(0, -1) + 'er';
      reason = 'nom. -er does not match gen. stem (expected puer/puerī or ager/agrī pattern)';
    } else if (nom.endsWith('ir')) { ok = nom === stem; reason = 'nom. -ir does not match gen. stem'; }
    else return none(parts, `2nd-decl genitive ${gen} with unexpected nominative ${nom}`, gender);
    if (!ok) return { paradigm: 'n2m', stem, parts, ...g, confidence: 'low', reason: `${nom}, ${gen}: ${reason}` };
    if (gender !== 'm') return { paradigm: 'n2m', stem, parts, ...g, confidence: 'low', reason: `2nd-decl -us/-er noun with gender ${gender ?? 'missing'}` };
    return { paradigm: 'n2m', stem, parts, gender, confidence: 'high' };
  }
  if (gen.endsWith('ōrum') && nom.endsWith('ī')) {
    return { paradigm: 'n2m', stem: gen.slice(0, -4), parts, ...g, number: 'pl', confidence: gender ? 'high' : 'low' };
  }
  if (gen.endsWith('is')) return none(parts, `genitive ${gen}: 3rd declension, not implemented yet`, gender);
  if (gen.endsWith('ūs')) return none(parts, `genitive ${gen}: 4th declension, not implemented yet`, gender);
  return none(parts, `cannot classify noun ${nom}, ${gen}`, gender);
}

function inferAdj(parts: string[]): Inference {
  const [m, f, n] = parts as [string, string | undefined, string | undefined];
  if (!f || !n) return none(parts, `adjective "${m}" needs three nominative forms`);
  // Plural-only (paucī, paucae, pauca).
  if (m.endsWith('ī') && f.endsWith('ae') && n.endsWith('a')) {
    const base = f.slice(0, -2);
    const ok = m === base + 'ī' && n === base + 'a';
    return { paradigm: 'adj12', stem: base, parts, number: 'pl', confidence: ok ? 'high' : 'low', reason: ok ? 'plural-only adjective' : 'plural forms do not share a base' };
  }
  if (!f.endsWith('a') || !n.endsWith('um')) return none(parts, `${m}, ${f}, ${n}: not a 1st/2nd-declension adjective (3rd decl. not implemented yet)`);
  const base = f.slice(0, -1);
  if (n !== base + 'um') return { paradigm: 'adj12', stem: base, parts, confidence: 'low', reason: `neuter ${n} does not match feminine ${f}` };
  if (m === base + 'us') return { paradigm: 'adj12', stem: base, parts, confidence: 'high' };
  if (m.endsWith('er') && (m === base || (base.endsWith('r') && m === base.slice(0, -1) + 'er'))) {
    return { paradigm: 'adj12', stem: base, parts, confidence: 'high', reason: m === base ? '-er adjective keeping e' : '-er adjective dropping e' };
  }
  return { paradigm: 'adj12', stem: base, parts, confidence: 'low', reason: `masculine ${m} does not match feminine ${f}` };
}

/** Build a stable ASCII id like "laudo-v1", "ager-n2m". */
export function lemmaId(first: string, paradigm: ParadigmId): string {
  const ascii = nfc(first).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '');
  return `${ascii}-${paradigm.replace(':', '-')}`;
}

/**
 * Split a paired dictionary entry such as
 * "amīcus, amīcī, m., and amīca, amīcae, f." into its two headwords.
 */
export function splitPairedHeadword(headword: string): string[] {
  return nfc(headword).split(/,\s*and\s+/).map((s) => s.trim()).filter(Boolean);
}
