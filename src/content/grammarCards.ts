/**
 * Short grammar cards that open each section's Dēclīnātiō/Coniugātiō node.
 * Original writing. Text uses [[termId|shown text]] for glossary links and
 * *…* for Latin. Tables are generated from model words by src/morph.
 */
export type TableSpec =
  | { kind: 'noun'; headword: string; gloss: string }
  | { kind: 'verbs'; headwords: [string, string]; glosses: [string, string] }
  | { kind: 'sum' };

export interface GrammarCard {
  section: number;
  /** Title with optional [[term|text]] markup. */
  title: string;
  blocks: ({ p: string } | { table: TableSpec })[];
}

export const GRAMMAR_CARDS: readonly GrammarCard[] = [
  {
    section: 1,
    title: 'The present: 1st & 2nd [[conjugation|conjugation]]',
    blocks: [
      { p: 'The [[infinitive|infinitive]] shows the family: -āre is 1st conjugation, -ēre is 2nd. Cut off -re to get the [[stem|stem]], then add an ending that shows [[person|person]] and [[number|number]]. Tap any underlined word for a definition.' },
      { table: { kind: 'verbs', headwords: ['amō, amāre', 'videō, vidēre'], glosses: ['love', 'see'] } },
      { p: 'Commands use the [[imperative|imperative]]: the bare stem for one person, stem + -te for more: *amā, amāte*; *vidē, vidēte*.' },
      { p: 'A long vowel goes short before another vowel, before a final -m, -r or -t, and before nt: *videō*, *amat*, *amant*.' },
    ],
  },
  {
    section: 2,
    title: 'First [[declension|declension]]',
    blocks: [
      { p: 'A noun’s [[case|case]] ending shows its job in the sentence. Drop -ae from the genitive singular to find the [[base|base]], then add the endings.' },
      { table: { kind: 'noun', headword: 'porta, portae, f.', gloss: 'gate' } },
      { p: 'Watch the overlaps: -ae can be [[genitive|genitive]] or [[dative|dative]] singular, or [[nominative|nominative]] or [[vocative|vocative]] plural; -īs is both dative and [[ablative|ablative]] plural. Context decides.' },
      { p: 'Most of these nouns are feminine in [[gender|gender]]. An adjective in [[agreement|agreement]] with a feminine noun takes these same endings: *rosa magna*, *rosae magnae*.' },
    ],
  },
  {
    section: 3,
    title: 'Second [[declension|declension]]: masculine',
    blocks: [
      { p: 'Nouns of the 2nd declension have genitive singular -ī. Most nouns in -us, -er and -ir are masculine.' },
      { table: { kind: 'noun', headword: 'amīcus, amīcī, m.', gloss: 'friend' } },
      { p: 'The [[vocative|vocative]] singular of -us nouns ends in -e: *amīce!* Nouns in -ius end in -ī: *fīlī!* (and *meus* becomes *mī*).' },
      { p: 'Nouns in -er and -ir have no ending in the nominative and vocative singular: *puer*, *ager*, *vir*. The genitive shows the [[base|base]]: *puerī* keeps the e, *agrī* drops it.' },
      { p: 'Masculine adjectives use these endings too: *amīcus avārus*, *puer avārus*. [[agreement|Agreement]] means the same gender, number and case, not always the same ending.' },
    ],
  },
  {
    section: 4,
    title: 'Second declension: [[neuter|neuter]]; *sum*',
    blocks: [
      { p: 'Neuter nouns of the 2nd declension end in -um. The nominative, accusative and vocative are always alike, and in the plural all three end in -a.' },
      { table: { kind: 'noun', headword: 'bellum, bellī, n.', gloss: 'war' } },
      { table: { kind: 'sum' } },
      { p: 'After *sum*, a [[predicate-nominative|predicate nominative]] renames or describes the subject: *Bellum est malum.*' },
      { p: 'Adjectives now use all three genders: *bonus, bona, bonum*. On its own an adjective can stand for a noun, a [[substantive|substantive]]: *bonī*, good people.' },
    ],
  },
];

export const cardFor = (section: number): GrammarCard | undefined => GRAMMAR_CARDS.find((c) => c.section === section);

export type Segment = { text: string; la?: boolean; term?: string };

/** Parse [[id|text]] and *latin* markup into segments. */
export function segments(s: string): Segment[] {
  const out: Segment[] = [];
  const re = /\[\[([a-z-]+)\|([^\]]+)\]\]|\*([^*]+)\*/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ text: s.slice(last, m.index) });
    if (m[1]) out.push({ text: m[2]!, term: m[1] });
    else out.push({ text: m[3]!, la: true });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** Every glossary id referenced by a card. */
export const termsIn = (c: GrammarCard): string[] =>
  [c.title, ...c.blocks.flatMap((b) => ('p' in b ? [b.p] : []))].flatMap((s) => segments(s).flatMap((x) => (x.term ? [x.term] : [])));
