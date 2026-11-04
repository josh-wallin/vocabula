/**
 * Grammar glossary for sections 1–4. Original definitions; every Latin example
 * uses only vocabulary available by the term's section.
 * A term is shown (as a tappable dotted-underline word) only once its section is unlocked.
 */
export interface GlossaryTerm {
  id: string;
  name: string;
  latin: string;
  def: string;
  ex: string;
  exEn: string;
  section: number;
}

export const GLOSSARY: readonly GlossaryTerm[] = [
  /* ---- Section 1: verbs ---- */
  {
    id: 'person', name: 'Person', latin: 'persōna', section: 1,
    def: 'Who is acting, seen from the speaker: 1st person is the speaker (I, we), 2nd is the one spoken to (you), 3rd is anyone else (he, she, it, they). In Latin the verb ending shows it.',
    ex: 'Vocō. Vocās. Vocat.', exEn: 'I call. You call. She calls.',
  },
  {
    id: 'number', name: 'Number', latin: 'numerus', section: 1,
    def: 'Whether a form refers to one (singular) or more than one (plural). Verbs, nouns and adjectives all show number.',
    ex: 'Laudat. Laudant.', exEn: 'He praises. They praise.',
  },
  {
    id: 'tense', name: 'Tense', latin: 'tempus', section: 1,
    def: 'When the action happens. Latin has six tenses; so far you have the present, which covers English “I see,” “I am seeing” and “I do see.”',
    ex: 'Vident.', exEn: 'They see / they are seeing / they do see.',
  },
  {
    id: 'mood', name: 'Mood', latin: 'modus', section: 1,
    def: 'What kind of statement a verb makes. The indicative states facts and asks questions; the imperative gives commands.',
    ex: 'Mē monēs. Mē monē!', exEn: 'You warn me. Warn me!',
  },
  {
    id: 'voice', name: 'Voice', latin: 'genus verbī', section: 1,
    def: 'Whether the subject does the action (active) or has it done to it (passive). Every verb form so far is active.',
    ex: 'Mē servās.', exEn: 'You save me.',
  },
  {
    id: 'conjugation', name: 'Conjugation', latin: 'coniugātiō', section: 1,
    def: 'A family of verbs that build their forms the same way. The vowel before -re in the infinitive tells you the family: ā for the 1st, ē for the 2nd. To conjugate a verb is to list its forms in order.',
    ex: 'amō, amāre · videō, vidēre', exEn: '-āre: 1st conjugation · -ēre: 2nd conjugation',
  },
  {
    id: 'infinitive', name: 'Infinitive', latin: 'īnfīnītīvus', section: 1,
    def: 'The “to” form of a verb. It names the action without saying who does it, so it has no person or number. It is the second form a dictionary lists.',
    ex: 'Nōn dēbēs errāre.', exEn: 'You shouldn’t make a mistake.',
  },
  {
    id: 'imperative', name: 'Imperative', latin: 'imperātīvus', section: 1,
    def: 'The command form. For one person it is the bare stem; for more than one, add -te.',
    ex: 'Valē! Valēte!', exEn: 'Goodbye! (to one person, then to a group)',
  },
  {
    id: 'stem', name: 'Stem', latin: 'thema', section: 1,
    def: 'The part of a verb that endings attach to. For the present, cut -re off the infinitive.',
    ex: 'laudāre → laudā-', exEn: 'laudā- + -mus = laudāmus, we praise',
  },

  /* ---- Section 2: nouns, first declension ---- */
  {
    id: 'case', name: 'Case', latin: 'cāsus', section: 2,
    def: 'The form a noun or adjective takes to show its job in the sentence: subject, object, possessor and so on. Latin has six cases, so word order is free to vary.',
    ex: 'Puella poētam laudat.', exEn: 'The girl praises the poet.',
  },
  {
    id: 'declension', name: 'Declension', latin: 'dēclīnātiō', section: 2,
    def: 'A family of nouns that share one set of case endings. Latin has five. The genitive singular tells you which family a noun belongs to; to decline a noun is to list its cases.',
    ex: 'porta, portae · vīta, vītae', exEn: 'genitive singular in -ae: 1st declension',
  },
  {
    id: 'base', name: 'Base', latin: 'rādīx', section: 2,
    def: 'The part of a noun that stays the same. Find it by dropping the ending from the genitive singular, then add the case endings to it.',
    ex: 'pecūnia, pecūniae → pecūni-', exEn: 'pecūni- + -ārum = pecūniārum, of money',
  },
  {
    id: 'nominative', name: 'Nominative', latin: 'nōminātīvus', section: 2,
    def: 'The case of the subject, and of a word that renames or describes the subject after a linking verb such as est.',
    ex: 'Puella valet.', exEn: 'The girl is well.',
  },
  {
    id: 'genitive', name: 'Genitive', latin: 'genetīvus', section: 2,
    def: 'Links one noun to another, most often to show possession. Usually translated with “of” or an apostrophe-s.',
    ex: 'fāma poētae', exEn: 'the poet’s fame',
  },
  {
    id: 'dative', name: 'Dative', latin: 'datīvus', section: 2,
    def: 'Marks the indirect object: the person to whom or for whom something is done.',
    ex: 'Puellae rosam dō.', exEn: 'I give a rose to the girl.',
  },
  {
    id: 'accusative', name: 'Accusative', latin: 'accūsātīvus', section: 2,
    def: 'Marks the direct object, the thing the verb acts on. Some prepositions also take it.',
    ex: 'Rosās videō.', exEn: 'I see roses.',
  },
  {
    id: 'ablative', name: 'Ablative', latin: 'ablātīvus', section: 2,
    def: 'Covers ideas like by, with, from, in, on and at: means, manner, place, time and separation. Many prepositions take it, such as sine, without.',
    ex: 'Sine īrā monet.', exEn: 'She gives advice without anger.',
  },
  {
    id: 'vocative', name: 'Vocative', latin: 'vocātīvus', section: 2,
    def: 'Used to address someone directly. It usually looks like the nominative; 2nd-declension nouns in -us are the main exception.',
    ex: 'Salvē, poēta!', exEn: 'Hello, poet!',
  },
  {
    id: 'gender', name: 'Gender', latin: 'genus', section: 2,
    def: 'Every noun is masculine, feminine or neuter. For people it follows sex; for things it is a grammatical fact to learn with the word. Most 1st-declension nouns are feminine.',
    ex: 'nauta, m. · porta, f.', exEn: 'sailor (masculine) · gate (feminine)',
  },
  {
    id: 'agreement', name: 'Agreement', latin: 'congruentia', section: 2,
    def: 'An adjective takes the same gender, number and case as the noun it describes. That doesn’t always mean the same ending.',
    ex: 'Multās rosās amat.', exEn: 'She loves many roses.',
  },

  /* ---- Section 3: second declension ---- */
  {
    id: 'apposition', name: 'Apposition', latin: 'appositiō', section: 3,
    def: 'A noun set beside another noun to explain it, in the same case. Set it off with commas in English.',
    ex: 'Fīlium meum, poētam, laudō.', exEn: 'I praise my son, the poet.',
  },

  /* ---- Section 4: neuters, sum ---- */
  {
    id: 'neuter', name: 'Neuter', latin: 'neutrum', section: 4,
    def: 'The third gender, “neither” masculine nor feminine. A neuter’s nominative and accusative are always the same, and in the plural both end in -a.',
    ex: 'Cōnsilium est bonum; cōnsilium laudō.', exEn: 'The plan is good; I praise the plan.',
  },
  {
    id: 'predicate-nominative', name: 'Predicate nominative', latin: 'nōminātīvus praedicātīvus', section: 4,
    def: 'A noun or adjective after a linking verb such as sum that renames or describes the subject. It is nominative, like the subject; an adjective also agrees with it.',
    ex: 'Fēmina est magistra.', exEn: 'The woman is a teacher.',
  },
  {
    id: 'substantive', name: 'Substantive', latin: 'adiectīvum substantīvē positum', section: 4,
    def: 'An adjective used on its own as a noun. Its gender and number tell you what to supply: masculine for men or people, feminine for women, neuter for things.',
    ex: 'Stultī saepe errant.', exEn: 'Fools often make mistakes.',
  },
];

export const glossaryById = new Map(GLOSSARY.map((t) => [t.id, t]));

/** Terms available when the learner has reached `section`. */
export const unlockedTerms = (section: number): GlossaryTerm[] => GLOSSARY.filter((t) => t.section <= section);

/** The term, if it exists and is unlocked at `section`; otherwise null (render as plain text). */
export function termIfUnlocked(id: string, section: number): GlossaryTerm | null {
  const t = glossaryById.get(id);
  return t && t.section <= section ? t : null;
}
