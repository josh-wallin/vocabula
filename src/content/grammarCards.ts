/**
 * Short grammar cards that open each section's Dēclīnātiō/Coniugātiō node.
 * Original writing. Text uses [[termId|shown text]] for glossary links and
 * *…* for Latin. Tables are generated from model words by src/morph.
 */
export type TableSpec =
  | { kind: 'noun'; headword: string; gloss: string }
  /** One column per verb; present shows infinitive and imperatives too. Default tense: present. */
  | { kind: 'verbs'; headwords: string[]; glosses: string[]; tense?: 'pres' | 'fut' | 'impf' }
  /** sum (default) or another irregular (possum), one tense, in a 3×2 person grid. */
  | { kind: 'sum'; headword?: string; gloss?: string; tense?: 'pres' | 'fut' | 'impf' }
  /** A word declined in three genders (demonstratives, -īus adjectives): nom.–abl., singular then plural. */
  | { kind: 'gendered'; headword: string; gloss: string; pos: 'pron' | 'adj' };

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
  /* Sections 5–8 appear only when the content pack has words for their chapters. */
  {
    section: 5,
    title: 'The [[future|future]] and [[imperfect|imperfect]]: 1st & 2nd conjugation',
    blocks: [
      { p: 'Two new [[tense|tenses]] build on the same [[stem|stem]] as the present. The future adds -bō, -bis, -bit, -bimus, -bitis, -bunt: *laudābō*, I shall praise.' },
      { table: { kind: 'verbs', headwords: ['laudō, laudāre', 'moneō, monēre'], glosses: ['praise', 'warn'], tense: 'fut' } },
      { p: 'The imperfect adds -bam, -bās, -bat, -bāmus, -bātis, -bant. It pictures action going on or repeated in the past: *monēbam*, I was warning, I used to warn.' },
      { table: { kind: 'verbs', headwords: ['laudō, laudāre', 'moneō, monēre'], glosses: ['praise', 'warn'], tense: 'impf' } },
      { p: 'Watch the vowel after the b: -bi- (and -bunt) in the future, -bā- in the imperfect. *Vidēbit* is future; *vidēbat* is imperfect.' },
      { p: 'Adjectives in -er, like *līber, lībera, līberum* and *pulcher, pulchra, pulchrum*, decline like *bonus* once past the masculine nominative. The feminine shows whether the e stays: *lībera* keeps it, *pulchra* drops it.' },
    ],
  },
  {
    section: 6,
    title: '*sum* and *possum*',
    blocks: [
      { p: '*Sum* uses the stem er- in the future and the imperfect. The future has no -b-: *erō*, *erit*, *erunt*. The imperfect has -a-: *eram*, *erat*, *erant*.' },
      { table: { kind: 'sum', tense: 'fut' } },
      { table: { kind: 'sum', tense: 'impf' } },
      { p: '*Possum*, I am able, I can, is pot- + *sum*. Before s, pot- becomes pos-: *possum*, *possunt*, but *potest*, *poterat*, *poterit*. The infinitive is *posse*.' },
      { table: { kind: 'sum', headword: 'possum, posse, potuī', gloss: 'be able, can', tense: 'pres' } },
      { p: '*Possum* is completed by a [[complementary-infinitive|complementary infinitive]], as *dēbeō* is: *Vidēre possum*, I can see; *Errāre nōn dēbēs*, you ought not to err.' },
    ],
  },
  {
    section: 7,
    title: 'Third [[declension|declension]]',
    blocks: [
      { p: 'Third-declension nouns have genitive singular -is. Their nominative singular takes many shapes, so the genitive is what shows the [[base|base]]: *rēx, rēgis* gives rēg-; *corpus, corporis* gives corpor-.' },
      { table: { kind: 'noun', headword: 'rēx, rēgis, m.', gloss: 'king' } },
      { p: 'This family has all three [[gender|genders]]. Masculine and feminine nouns share their endings; [[neuter|neuters]] keep the rule you know: nominative and accusative alike, -a in the plural.' },
      { table: { kind: 'noun', headword: 'corpus, corporis, n.', gloss: 'body' } },
      { p: 'Some endings look like other declensions: -ī is dative here, not genitive; -e is ablative; -ēs is nominative or accusative plural. In *hominī*, *homine*, *hominēs*, let the genitive tell you the family.' },
      { p: 'An adjective of the 1st/2nd declension agrees in gender, number and case, not in ending: *rēx bonus*, *rēgis bonī*, *tempus malum*.' },
    ],
  },
  {
    section: 8,
    title: 'Third [[conjugation|conjugation]]',
    blocks: [
      { p: 'Verbs with a short -ere infinitive belong to the 3rd conjugation: *agō, agere*. Drop -ere to find the base (ag-) and add the endings with a short i: *agis*, *agit*, *agimus*, *agitis*, but *agunt*.' },
      { table: { kind: 'verbs', headwords: ['agō, agere', 'dūcō, dūcere'], glosses: ['drive', 'lead'] } },
      { p: 'The singular command is the base + -e: *age!* A few verbs drop the -e, such as *dūc!*; the others come with their verbs later.' },
      { p: 'The 3rd-conjugation future has no -b-: -am, -ēs, -et, -ēmus, -ētis, -ent. *Agam*, I shall drive; *aget*, she will drive; but *agit*, she drives.' },
      { table: { kind: 'verbs', headwords: ['agō, agere', 'scrībō, scrībere'], glosses: ['drive', 'write'], tense: 'fut' } },
      { p: 'The imperfect uses -ēbam: *agēbam*, *dūcēbant*. Mind the trap: *agēs* and *aget* look like the 2nd-conjugation present (*monēs*, *monet*), but here they are future.' },
      { table: { kind: 'verbs', headwords: ['agō, agere', 'dūcō, dūcere'], glosses: ['drive', 'lead'], tense: 'impf' } },
    ],
  },
  /* Sections 9–10, likewise. */
  {
    section: 9,
    title: '[[demonstrative|Demonstratives]]; the -īus adjectives',
    blocks: [
      { p: 'A [[demonstrative|demonstrative]] points something out. *Hic* means this (near me); *ille* means that (over there). With a noun it works as an adjective and agrees with it: *hic liber*, *haec puella*, *hoc dōnum*. On its own it is a [[pronoun|pronoun]]: *hic*, this man; *illa*, that woman.' },
      { table: { kind: 'gendered', headword: 'hic, haec, hoc', gloss: 'this', pos: 'pron' } },
      { p: 'Mind the look-alikes. *Haec* is feminine singular or neuter plural: *haec puella*, *haec dōna*. *Hoc* is neuter nominative or accusative, but *hōc* and *hāc*, with a long vowel, are ablative. *Huic* is dative in every gender.' },
      { table: { kind: 'gendered', headword: 'ille, illa, illud', gloss: 'that', pos: 'pron' } },
      { p: '*Ille* has the endings of *magnus* except in four places: the masculine nominative *ille*, the neuter *illud*, the genitive singular *illīus* and the dative singular *illī*, the same in all genders. *Iste, ista, istud*, that of yours, declines exactly like *ille* and often sounds scornful: *iste tyrannus*.' },
      { p: 'Nine adjectives share that genitive in -īus and dative in -ī, though dictionaries list them like *bonus*: *ūllus*, *nūllus*, *ūnus*, *tōtus*, *sōlus*, *neuter*, *alius*, *alter*, *uter*. Everywhere else they decline like *bonus*: *ūnīus fēminae*, *tōtī patriae*, but *ūnam fēminam*.' },
      { table: { kind: 'gendered', headword: 'sōlus, sōla, sōlum', gloss: 'alone, only', pos: 'adj' } },
      { p: 'Two need care. *Alius* has neuter *aliud*, and its genitive singular is borrowed from *alter*: *alterīus*. *Alter*, the other of two, keeps its e like *līber*: *altera*, *alterum*, *alterī*.' },
      { p: 'Watch -ī: in *illī* or *ūnī* it can be dative singular or masculine nominative plural, never genitive. The genitive singular of these words always ends in -īus.' },
    ],
  },
  {
    section: 10,
    title: 'Fourth [[conjugation|conjugation]] and 3rd-conjugation -iō verbs',
    blocks: [
      { p: 'Verbs with infinitive -īre belong to the 4th conjugation: *audiō, audīre*. The stem is audī-, and the long ī shows in *audīs*, *audīmus*, *audītis*, *audī!* It goes short before another vowel and before a final -t or nt: *audiō*, *audit*, *audiunt*.' },
      { p: 'Some verbs have a 3rd-conjugation infinitive in short -ere, yet a first form in -iō: *capiō, capere*. Wheelock counts them as a kind of 3rd conjugation. They keep an i wherever the 4th conjugation has one before a vowel (*capiō*, *capiunt*, *capiam*, *capiēbam*) and otherwise behave like *agō*: *capis*, *capit*, *capimus*, *capere*, *cape!*' },
      { table: { kind: 'verbs', headwords: ['agō, agere', 'capiō, capere', 'audiō, audīre'], glosses: ['drive', 'take', 'hear'] } },
      { p: 'So read the first two forms together: -āre is 1st, -ēre is 2nd, -īre is 4th. Short -ere is 3rd, and if the first form ends in -iō, it is a 3rd-conjugation -iō verb.' },
      { p: 'The future and imperfect follow the 3rd conjugation, with that i: -iam, -iēs, -iet; -iēbam, -iēbās. *Audiet*, she will hear; *audiēbat*, she was hearing; but *audit*, she hears.' },
      { table: { kind: 'verbs', headwords: ['capiō, capere', 'audiō, audīre'], glosses: ['take', 'hear'], tense: 'fut' } },
      { table: { kind: 'verbs', headwords: ['capiō, capere', 'audiō, audīre'], glosses: ['take', 'hear'], tense: 'impf' } },
      { p: 'The short commands now come with their verbs: *dīc!* from *dīcō*, *fac!* from *faciō*.' },
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
