/**
 * Familia Rōmāna (Ørberg) chapter word lists → "preview" entries for the private pack.
 * Pure: no file I/O and no FR data here (the source list is copyrighted and lives
 * only under content/private/). scripts/build-pack.ts reads the list and calls this.
 *
 * A preview is taught for meaning only (new-word card, Latin→English, later English→Latin).
 * Each entry gets the lemma id the Wheelock or DCC import would give the same word, so
 * the FSRS cards are shared when the main path teaches it later.
 */
import type { Gender, Lemma, PartOfSpeech } from '../morph/types.ts';
import { lemmaFromHeadword } from '../morph/lemma.ts';
import { lemmaId, parseHeadword } from '../morph/infer.ts';
import { nfc } from '../morph/phonology.ts';
import { expandHeadword } from './dcc.ts';
import { matchKey } from '../engine/lexicon.ts';

/** One row of the FR source list (content/private/source/fr_ch*.json). */
export interface FrSourceEntry {
  headword: string;
  lemma: string;
  pos: string;
  gender?: string;
  gloss: string;
  chapter: number;
  inWheelock: number | null;
  inDcc: number | null;
  notes?: string;
  properKind?: 'place' | 'character';
  wheelockHeadword?: string;
  frIndex?: string;
}

/** A preview word as stored in the pack's `fr` array. Only headword, forms and gloss travel. */
export interface FrEntry {
  /** Lemma with `sources: []`. Its id matches the Wheelock/DCC lemma for the same word. */
  lemma: Lemma;
  /** Familia Rōmāna chapter (capitulum) that introduces the word. */
  chapter: number;
  /** Position in the source list (stable ordering inside a chapter). */
  order: number;
  /** Wheelock chapter that teaches the word, when it is on a Wheelock list. */
  wheelockChapter?: number;
  /** DCC core-list rank, when the word is on that list. */
  dccRank?: number;
}

export interface FrImport {
  entries: FrEntry[];
  excluded: { entry: FrSourceEntry; reason: string }[];
  /** Entries kept with a fallback (indeclinable) lemma because no paradigm could be inferred. */
  fallback: { entry: FrSourceEntry; reason: string }[];
}

const POS: Record<string, PartOfSpeech> = {
  noun: 'noun', verb: 'verb', adj: 'adj', adv: 'adv', pron: 'pron', prep: 'prep',
  conj: 'conj', interj: 'interj', num: 'num',
};

/** DCC-style label for an FR headword's abbreviated forms, so DCC's expander can spell them out. */
function dccLabel(pos: PartOfSpeech, toks: string[]): string | null {
  const t1 = toks[1] ?? '';
  if (pos === 'noun') {
    if (t1 === '-ae' || t1 === '-ārum') return 'Noun: 1st Declension';
    if (/^-i?ī$/.test(t1) || t1 === '-ōrum') return 'Noun: 2nd Declension';
    if (/is$/.test(t1) || t1 === '-um' || t1 === '-ium') return 'Noun: 3rd Declension';
    return null;
  }
  if (pos === 'adj') return toks.length >= 3 && /^-(a|ae)$/.test(t1) ? 'Adjective: 1st and 2nd Declension' : null;
  if (pos === 'verb') {
    if (t1.endsWith('āre')) return 'Verb: 1st Conjugation';
    if (t1.endsWith('ēre')) return 'Verb: 2nd Conjugation';
    if (t1.endsWith('īre')) return 'Verb: 4th Conjugation';
    if (t1.endsWith('ere')) return (toks[0] ?? '').endsWith('iō') ? 'Verb: 3rd Conjugation -iō' : 'Verb: 3rd Conjugation -ō';
  }
  return null;
}

/** Spell out an FR headword ("capitulum, -ī, n." → "capitulum, capitulī, n."), or null. */
export function expandFrHeadword(headword: string, pos: PartOfSpeech): string | null {
  const hw = nfc(headword).replace(/\s*\([^)]*\)/g, '').trim();
  if (!hw.includes('-')) return hw; // already full ("liber, librī, m.") or a single form
  const toks = hw.split(',').map((t) => t.trim()).filter(Boolean);
  if (toks.some((t) => /\s/.test(t) && !/^[mfn]\. pl\.$/.test(t))) return null;
  const label = dccLabel(pos, toks);
  if (!label) return null;
  const ex = expandHeadword(toks.join(' '), label);
  return ex ? ex.headword : null;
}

/**
 * Tidy an FR headword for inference: drop a case note ("cum + abl."), a plural note after ";"
 * ("mīlle; pl. mīlia …"), and turn "ā / ab" into the main form plus an alternative.
 */
export function cleanFrHeadword(headword: string): { main: string; alt?: string } {
  let h = nfc(headword).split(';')[0]!.replace(/\s*\+\s*(abl|acc|gen|dat)\.(\s*\/\s*(abl|acc|gen|dat)\.)?/g, '').trim();
  const m = /^([^,\s/]+)\s*\/\s*([^,\s/]+)$/.exec(h);
  if (m) return { main: m[1]!, alt: m[2]! };
  h = h.replace(/\s+/g, ' ');
  return { main: h };
}

/** Parts of speech whose fallback words really don't inflect, so they share the Wheelock "-indecl" id. */
const UNINFLECTED: PartOfSpeech[] = ['adv', 'conj', 'prep', 'interj'];

/** Build the lemma for an FR entry: Wheelock's own lemma, else inference, else an indeclinable fallback. */
function frLemma(e: FrSourceEntry, pos: PartOfSpeech, wheelock: ReadonlyMap<string, Lemma>):
  { lemma: Lemma; wheelock?: Lemma; fallback?: string } {
  const gloss = nfc(e.gloss);
  const { main, alt } = cleanFrHeadword(e.headword);
  const withAlt = (l: Lemma): Lemma => (alt ? { ...l, headword: `${l.headword} (or ${alt})` } : l);
  const strip = (l: Lemma): Lemma => {
    // Only forms and the gloss travel; no FR notes.
    const { notes: _n, dcc: _d, ...rest } = l;
    return withAlt({ ...rest, gloss, sources: [] });
  };
  const hints: { gender: Gender | null } = { gender: e.gender === 'm' || e.gender === 'f' || e.gender === 'n' ? e.gender : null };
  const tries: string[] = [];
  if (e.wheelockHeadword) tries.push(e.wheelockHeadword);
  // Numerals that decline like 1st/2nd-declension adjectives (ūnus, -a, -um) are adjectives for DCC.
  const ipos: PartOfSpeech = pos === 'num' && /,\s*-a,\s*-um$/.test(main) ? 'adj' : pos;
  const ex = expandFrHeadword(main, ipos);
  if (ex) tries.push(ex);
  for (const hw of tries) {
    const { lemma } = lemmaFromHeadword(hw, ipos, gloss, [], hints);
    if (!lemma) continue;
    // Prefer the id of the Wheelock lemma for the same word, when the pack has it.
    const w = wheelock.get(lemma.id) ?? wheelock.get(`key:${matchKey(lemma)}`);
    return { lemma: strip(w ? { ...lemma, id: w.id } : lemma), ...(w ? { wheelock: w } : {}) };
  }
  const parsed = parseHeadword(main);
  const parts = parsed.parts.length ? parsed.parts : [e.lemma];
  const first = parts[0]!;
  // A declinable word with no paradigm yet (pronoun, numeral, irregular verb) gets a provisional id
  // that can't collide with an indeclinable of the same spelling (hic, haec, hoc vs. hīc).
  const plain = UNINFLECTED.includes(pos) || (pos === 'num' && parts.length === 1);
  const id = plain ? lemmaId(first, 'indecl') : `${lemmaId(first, 'indecl').replace(/-indecl$/, '')}-fr-${pos}`;
  return {
    lemma: withAlt({
      id, headword: main, parts, pos, paradigm: 'indecl', gloss, sources: [],
      ...(hints.gender ? { gender: hints.gender } : {}),
    }),
    fallback: `no paradigm inferred for "${e.headword}"`,
  };
}

/**
 * Select and convert FR entries.
 *  - proper names (characters and places) are left out;
 *  - words a Wheelock chapter at or before the FR chapter teaches are left out (the main path has them);
 *  - a word Wheelock teaches in a LATER chapter is kept as a preview, under the Wheelock lemma's id.
 * DCC words are kept: whether Plūra verba already teaches one by that point depends on the app's
 * DCC list and path, so the path builder decides (frBySection in src/engine/path.ts).
 * Duplicates (same lemma id) keep the first FR chapter.
 */
export function importFr(source: readonly FrSourceEntry[], wheelock: readonly Lemma[]): FrImport {
  const wIndex = new Map<string, Lemma>();
  for (const l of wheelock) { wIndex.set(l.id, l); wIndex.set(`key:${matchKey(l)}`, l); }
  const out: FrImport = { entries: [], excluded: [], fallback: [] };
  const seen = new Set<string>();
  source.forEach((e, order) => {
    const skip = (reason: string) => out.excluded.push({ entry: e, reason });
    if (e.pos === 'proper' || e.properKind) return skip(`proper name (${e.properKind ?? 'proper'})`);
    const pos = POS[e.pos];
    if (!pos) return skip(`unknown pos "${e.pos}"`);
    if (e.inWheelock !== null && e.inWheelock <= e.chapter) return skip(`taught in Wheelock ch. ${e.inWheelock}`);
    const { lemma, wheelock: w, fallback } = frLemma(e, pos, wIndex);
    const wch = w ? Math.min(...w.sources.map((x) => x.chapter)) : null;
    if (wch !== null && wch <= e.chapter) return skip(`taught in Wheelock ch. ${wch} (matched ${w!.id})`);
    if (seen.has(lemma.id)) return skip(`duplicate of ${lemma.id}`);
    seen.add(lemma.id);
    if (fallback) out.fallback.push({ entry: e, reason: fallback });
    out.entries.push({
      lemma, chapter: e.chapter, order,
      ...(e.inWheelock !== null || wch !== null ? { wheelockChapter: wch ?? e.inWheelock! } : {}),
      ...(e.inDcc !== null ? { dccRank: e.inDcc } : {}),
    });
  });
  return out;
}
