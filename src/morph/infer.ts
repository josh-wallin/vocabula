import type { Gender, Lemma, ParadigmId, PartOfSpeech } from './types.ts';
import { KNOWN_IRREGULAR } from './irregulars.ts';
import { isVowel, nfc, stripMacrons } from './phonology.ts';

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
  /** Lexical note to store on the lemma (from KNOWN_IRREGULAR). */
  note?: string;
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
/** Gender + plural tag, as printed for plural-only nouns ("īnsidiae, īnsidiārum, f. pl."). */
const GENDER_PL = /^([mfn])\.\s*pl\.$/;
/** Common gender (cīvis, m./f.; volucris, f./m.): masculine or feminine by sense. */
const COMMON_GENDER = /^[mf]\.\s*(\/|and|or)\s*[mf]\.$/;
const NON_INFLECTING: PartOfSpeech[] = ['adv', 'conj', 'prep', 'interj'];

/** Split a printed headword into citation forms and a gender tag. */
export function parseHeadword(headword: string): { parts: string[]; gender?: Gender; indeclinable: boolean; common?: true; plural?: true } {
  const cleaned = nfc(headword).replace(/\([^)]*\)/g, ' ');
  let gender: Gender | undefined;
  let indeclinable = false;
  let common = false;
  let plural = false;
  const parts: string[] = [];
  for (const raw of cleaned.split(',')) {
    const t = raw.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (t in GENDER_TOKENS) { gender = GENDER_TOKENS[t]; continue; }
    if (COMMON_GENDER.test(t)) { common = true; continue; }
    const gp = GENDER_PL.exec(t);
    if (gp) { gender = gp[1] as Gender; plural = true; continue; }
    if (t === 'pl.') { plural = true; continue; }
    if (/^indecl(inable|\.)?$/i.test(t)) { indeclinable = true; continue; }
    parts.push(t);
  }
  return { parts, ...(gender ? { gender } : {}), indeclinable, ...(common ? { common: true as const } : {}), ...(plural ? { plural: true as const } : {}) };
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
  const known = KNOWN_IRREGULAR[p0];
  const withIrr = (inf: Inference): Inference => {
    if (!known || (known.paradigm && known.paradigm !== inf.paradigm)) return inf;
    const cells = { ...known.cells, ...inf.irregular };
    return { ...inf, ...(Object.keys(cells).length ? { irregular: cells } : {}), ...(known.lemmaNote ? { note: known.lemmaNote } : {}) };
  };

  if (parsed.indeclinable || /^indecl/i.test(hints.declension ?? '')) {
    return { paradigm: 'indecl', stem: null, parts, confidence: 'high', ...(gender ? { gender } : {}) };
  }
  if (NON_INFLECTING.includes(pos)) {
    return { paradigm: 'indecl', stem: null, parts, confidence: 'high' };
  }

  switch (pos) {
    case 'verb': return withIrr(inferVerb(parts));
    case 'noun': return withIrr(inferNoun(parts, gender, parsed.common === true));
    case 'adj': return withIrr(inferAdj(parts));
    default: return none(parts, `paradigms for part of speech "${pos}" are not implemented yet`);
  }
}

function inferVerb(parts: string[]): Inference {
  const [p0, p1] = parts as [string, string | undefined];
  if (p0 === 'sum' && p1 === 'esse') return { paradigm: 'irr:sum', stem: null, parts, confidence: 'high' };
  if (p0 === 'possum' && p1 === 'posse') return { paradigm: 'irr:possum', stem: null, parts, confidence: 'high' };
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
  if (p1.endsWith('ere') && p0.endsWith('ō')) {
    // Short -ere: 3rd conjugation. agō, agere (base ag-) or capiō, capere (base cap-, -iō type).
    const base = p1.slice(0, -3);
    if (p0 === base + 'ō') {
      // Compounds of dūcō and dīcō keep the short imperative: ēdūc, ēdīc (A&G §182).
      const short = /(dūc|dīc)ō$/.test(p0) ? { irregular: { 'pres.act.imp.2sg': p0.slice(0, -1) } } : {};
      return { paradigm: 'v3', stem: base, parts, confidence: 'high', ...short };
    }
    if (p0 === base + 'iō') return { paradigm: 'v3io', stem: base, parts, confidence: 'high', reason: '3rd conjugation -iō' };
    return { paradigm: p0.endsWith('iō') ? 'v3io' : 'v3', stem: base, parts, confidence: 'low', reason: `1sg ${p0} and infinitive ${p1} have different stems` };
  }
  if (p1.endsWith('īre') && p0.endsWith('iō')) {
    const stem = p1.slice(0, -2);
    if (p0 !== stem.slice(0, -1) + 'iō') return { paradigm: 'v4', stem, parts, confidence: 'low', reason: `1sg ${p0} and infinitive ${p1} have different stems` };
    return { paradigm: 'v4', stem, parts, confidence: 'high' };
  }
  if (p1.endsWith('ere')) return none(parts, `infinitive ${p1} (short -ere): 3rd conjugation, but 1sg ${p0} does not end in -ō`);
  if (p1.endsWith('īre')) return none(parts, `infinitive ${p1}: 4th conjugation, but 1sg ${p0} does not end in -iō`);
  return none(parts, `cannot classify verb ${p0}, ${p1}`);
}

function inferNoun(parts: string[], gender: Gender | undefined, common: boolean): Inference {
  const [nom, gen] = parts as [string, string | undefined];
  const g = gender ? { gender } : {};
  if (!gen) return none(parts, `noun "${nom}" has no genitive`, gender);
  if (gen.endsWith('is')) return inferN3(parts, nom, gen, gender, common);
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
  if (gen.endsWith('ōrum') && nom === gen.slice(0, -4) + 'a') {
    // Plural-only 2nd-decl. neuter (arma, armōrum).
    return { paradigm: 'n2n', stem: gen.slice(0, -4), parts, gender: gender ?? 'n', number: 'pl',
      confidence: gender === 'n' ? 'high' : 'low', ...(gender === 'n' ? {} : { reason: `plural -a noun with gender ${gender ?? 'missing'}` }) };
  }
  if (gen.endsWith('um')) {
    const n3pl = inferN3Plural(parts, nom, gen, gender);
    if (n3pl) return n3pl;
  }
  if (gen.endsWith('ūs')) return none(parts, `genitive ${gen}: 4th declension, not implemented yet`, gender);
  return none(parts, `cannot classify noun ${nom}, ${gen}`, gender);
}

/* ---------------- 3rd declension ---------------- */

/**
 * Nouns that the i-stem rules would claim but that have gen. pl. -um
 * (A&G §78: canis, iuvenis, senex, vātēs, sēdēs; parēns usually parentum; volucris volucrum).
 */
const N3_CONSONANT_EXCEPTIONS = new Set(['canis', 'iuvenis', 'senex', 'vātēs', 'sēdēs', 'volucris', 'parēns']);

const endsInTwoConsonants = (s: string): boolean => {
  const a = s.slice(-2, -1);
  const b = s.slice(-1);
  return a !== '' && !isVowel(a) && !isVowel(b);
};

/**
 * Wheelock ch. 14 i-stem rules: m./f. nouns that are parisyllabic in -is/-ēs (hostis, hostis),
 * or whose nominative ends in -s/-x after a base ending in two consonants (urbs, urbis; nox, noctis);
 * neuters in -e, -al, -ar (mare, animal).
 */
export function isIStem(nom: string, base: string, neuter: boolean): boolean {
  if (neuter) return nom === base + 'e' || (nom.endsWith('al') && base.endsWith('āl')) || (nom.endsWith('ar') && base.endsWith('ār'));
  if (N3_CONSONANT_EXCEPTIONS.has(nom)) return false;
  if (nom === base + 'is' || nom === base + 'ēs') return true;
  return /[sx]$/.test(nom) && endsInTwoConsonants(base);
}

/** Why a printed 3rd-decl. nominative and genitive base don't fit together (null = consistent). */
function n3Inconsistency(nom: string, base: string): { fatal: boolean; reason: string } | null {
  const pn = stripMacrons(nom).toLowerCase();
  const pb = stripMacrons(base).toLowerCase();
  let cp = 0;
  while (cp < pn.length && cp < pb.length && pn[cp] === pb[cp]) cp++;
  if (cp < Math.max(1, Math.min(2, pn.length - 1))) return { fatal: false, reason: `nom. ${nom} and base ${base}- share no stem (irregular?)` };
  // Vowel quantities must agree in the shared stem, up to the nominative's last syllable
  // (whose quantity may legitimately differ: amor/amōris, homō/hominis, āēr/āeris).
  let lastV = pn.length - 1;
  while (lastV > 0 && !isVowel(pn[lastV])) lastV--;
  while (lastV > 0 && isVowel(pn[lastV - 1])) lastV--;
  for (let i = 0; i < Math.min(cp, lastV); i++) {
    if (nom[i] !== base[i]) return { fatal: true, reason: `vowel length differs between nom. ${nom} and gen. ${base}is` };
  }
  // Long vowel + t/d/r in the base keeps its length in the nominative: virtūt- → virtūs, cīvitāt- → cīvitās, mōr- → mōs.
  const ld = /[āēīōū][tdr]$/.test(base) && pn === pb.slice(0, -1) + 's';
  if (ld && nom !== base.slice(0, -1) + 's') return { fatal: true, reason: `nom. ${nom} should be ${base.slice(0, -1)}s (base ${base}-)` };
  // -ō nouns (homō, hominis; ratiō, ratiōnis) have a long final ō.
  if (/(in|ōn)$/.test(base) && nom.endsWith('o')) return { fatal: true, reason: `nom. ${nom} should end in -ō (base ${base}-)` };
  return null;
}

/** Neuter guess for a 3rd-decl. noun printed without gender. */
const looksNeuter = (nom: string, base: string): boolean =>
  /men$/.test(nom) || (/us$/.test(nom) && /[eo]r$/.test(stripMacrons(base))) || isIStem(nom, base, true);

function inferN3(parts: string[], nom: string, gen: string, gender: Gender | undefined, common: boolean): Inference {
  const base = gen.slice(0, -2);
  if (!base) return none(parts, `genitive ${gen} has no base`, gender);
  const bad = n3Inconsistency(nom, base);
  if (bad?.fatal) return none(parts, bad.reason, gender);
  let confidence: Confidence = bad ? 'low' : 'high';
  const reasons: string[] = bad ? [bad.reason] : [];
  let neuter: boolean;
  if (gender) neuter = gender === 'n';
  else if (common) { neuter = false; reasons.push('common gender (m./f.)'); }
  else { neuter = looksNeuter(nom, base); confidence = 'low'; reasons.push(`gender not given (guessed ${neuter ? 'neuter' : 'm./f.'})`); }
  const i = isIStem(nom, base, neuter);
  if (i) reasons.push('i-stem');
  const paradigm: ParadigmId = neuter ? (i ? 'n3in' : 'n3n') : (i ? 'n3i' : 'n3');
  return { paradigm, stem: base, parts, ...(gender ? { gender } : neuter ? { gender: 'n' as const } : {}), confidence,
    ...(reasons.length ? { reason: reasons.join('; ') } : {}) };
}

/** Plural-only 3rd-decl. nouns: māiōrēs, māiōrum (m.); moenia, moenium (n., i-stem). */
function inferN3Plural(parts: string[], nom: string, gen: string, gender: Gender | undefined): Inference | null {
  const mk = (paradigm: ParadigmId, base: string, neuter: boolean): Inference => {
    const ok = neuter ? gender === 'n' : gender === 'm' || gender === 'f';
    return { paradigm, stem: base, parts, ...(gender ? { gender } : neuter ? { gender: 'n' as const } : {}), number: 'pl',
      confidence: ok ? 'high' : 'low', ...(ok ? {} : { reason: `plural-only noun with gender ${gender ?? 'missing'}` }) };
  };
  if (gen.endsWith('ium')) {
    const base = gen.slice(0, -3);
    if (nom === base + 'ia') return mk('n3in', base, true);
    if (nom === base + 'ēs') return mk('n3i', base, false);
  }
  const base = gen.slice(0, -2);
  if (nom === base + 'a') return mk('n3n', base, true);
  if (nom === base + 'ēs') return mk('n3', base, false);
  return null;
}

/* ---------------- adjectives ---------------- */

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

/**
 * Build a stable ASCII id like "laudo-v1", "ager-n2m". Enclitics printed with a
 * leading hyphen get "-enclitic" ("-ne" → "ne-enclitic"), so they never collide
 * with a free word of the same letters (nē, "not").
 */
export function lemmaId(first: string, paradigm: ParadigmId): string {
  const ascii = nfc(first).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '');
  if (/^\s*-/.test(first) && paradigm === 'indecl') return `${ascii}-enclitic`;
  return `${ascii}-${paradigm.replace(':', '-')}`;
}

/**
 * Split a paired dictionary entry such as
 * "amīcus, amīcī, m., and amīca, amīcae, f." into its two headwords.
 */
export function splitPairedHeadword(headword: string): string[] {
  return nfc(headword).split(/,\s*and\s+/).map((s) => s.trim()).filter(Boolean);
}
