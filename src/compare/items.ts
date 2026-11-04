/**
 * The voice-test items (#/compare): short Latin chosen to expose how a TTS engine handles
 * restored classical pronunciation (W. S. Allen, *Vox Latina*). Each has a note on what to
 * listen for. Sentences marked `from` are taken verbatim from content/sentences.
 *
 * Two sections: the original voice test (COMPARE_ITEMS, all engines) and the Gemini spot-check
 * (SPOT_ITEMS): texts the app actually plays, exactly as it plays them (tests/compare.test.ts
 * checks each against its source), before Gemini replaces eSpeak for every clip.
 */
import type { ColumnId } from './protocol.ts';

/** Where a spot-check text comes from (tests check it is really there). */
export type ItemSource =
  | 'dcc-word' // a DCC lemma's first form (the new-word card's word clip)
  | 'dcc-citation' // a DCC lemma's citation (rosa, rosae)
  | 'pack-word' // a Wheelock word (private pack): only in the voice test
  | 'bank-form' // a word as written in a sentence-bank sentence
  | 'historia-word' // Historia tap-to-hear: a passage word, lower-cased as the app speaks it
  | 'historia' // a whole Historia passage, as spoken
  | 'lectio' // a Lectiō sentence, as printed
  | 'sentence'; // a sentence-bank sentence (`from` = its id)

export interface CompareItem {
  id: string;
  /** Latin with macrons, as sent to the engines (plain variant). */
  la: string;
  /** What to listen for. */
  listen: string;
  /** Sentence-bank id, when the text comes from content/sentences. */
  from?: string;
  /** Spot-check: where the text comes from. */
  src?: ItemSource;
}

export const COMPARE_ITEMS: readonly CompareItem[] = [
  { id: 'c-hard', la: 'Cicerō, Caesar, centum', listen: 'c is always [k]: KI-ke-rō, KAI-sar, KEN-tum — never s or ch.' },
  { id: 'v-w', la: 'vīnum, virī, vōx', listen: 'Consonantal v is English w: WĪ-num, WI-rī, wōks.' },
  { id: 'ae-oe', la: 'caelum, poena, Graecia', listen: 'ae as in "eye", oe as in "oil": KAI-lum, POI-na. Not "ee".' },
  { id: 'qu-ngu', la: 'quis, aqua, lingua', listen: 'qu is a single consonant, [kw] as in "quick"; ngu before a vowel is [ngw]: LIN-gwa.' },
  { id: 'gn', la: 'magnus, dignus, agnus', listen: 'g stays hard before n (Allen: [ŋn], "mang-nus"); not the Italian/French "ny".' },
  { id: 'g-hard', la: 'genus, gēns, legiō', listen: 'g is always hard [g], even before e and i: GE-nus, not "jenus".' },
  { id: 'malum', la: 'mālum, malum', listen: 'Length minimal pair: MĀ-lum (apple), long ā held; MA-lum (evil), short a.' },
  { id: 'liber', la: 'līber, liber', listen: 'LĪ-ber (free) with a long ī; LI-ber (book) with a short i.' },
  { id: 'populus', la: 'populus, pōpulus', listen: 'PO-pu-lus (people) short o; PŌ-pu-lus (poplar) long ō. Same stress, different length.' },
  { id: 'cons-i', la: 'iam, Iūlius, cuius, huius', listen: 'Initial i before a vowel = English y (yam, YŪ-li-us); between vowels doubled: KUY-yus, HUY-yus.' },
  { id: 'h', la: 'hodiē, mihi, homō', listen: 'h is a light breath, not dropped and not a rasp: HO-di-ē, MI-hi.' },
  { id: 'ph-th', la: 'philosophia, theātrum', listen: 'ph and th are aspirated p and t (pʰ, tʰ), not English f and θ.' },
  { id: 'gemination', la: 'anus, annus; ille, īle', listen: 'Double consonants are held: AN-nus (year) vs A-nus (old woman); IL-le vs Ī-le (groin).' },
  { id: 'stress', la: 'amāre, agricola, cēnābimus', listen: 'Penult law: a-MĀ-re (long penult), a-GRI-co-la and cē-NĀ-bi-mus (short penult → antepenult).' },
  { id: 's1', la: 'Puella rosās amat.', listen: 'Plain sentence: final -s unvoiced (not "z"), intervocalic s voiceless in rosās.', from: 's02-01' },
  { id: 's2', la: 'Virī avārī pecūniam semper amant.', listen: 'w in virī; long ī, ū; stress pe-KŪ-ni-am.', from: 's03-03' },
  { id: 's3', la: 'Caelum pulchrum est.', listen: 'KAI-lum; ch in pulchrum is [kʰ], not "ch"/"sh".', from: 's05-11' },
  { id: 's4', la: 'Vērī amīcī semper iuvant.', listen: 'w in vērī; consonantal i in iuvant = YU-want.', from: 's04-11' },
  { id: 's5', la: 'Cīvitās pācem nōn habēbat.', listen: 'KĪ-wi-tās, PĀ-kem — hard c twice; long vowels held.', from: 's07-04' },
  { id: 'aeneid', la: 'Arma virumque canō, Trōiae quī prīmus ab ōrīs', listen: 'Vergil, Aen. 1.1, read as prose: wi-RUM-kwe, KA-nō, TRŌY-yai, kwī.' },
  { id: 'gallia', la: 'Gallia est omnis dīvīsa in partēs trēs.', listen: 'Caesar, BG 1.1: GAL-li-a (double l), dī-WĪ-sa, long ē in partēs/trēs.' },
];

/**
 * Gemini spot-check: ~30 texts from the app's audio manifest, in the shapes the app plays
 * (single words, citations, Historia tap-to-hear forms, bank sentences, Lectiō and Historia lines),
 * plus the ph / th / ch words. Rated in the same table as the voice test (item ids `spot-…`).
 */
export const SPOT_ITEMS: readonly CompareItem[] = [
  // vocabulary words (new-word cards)
  { id: 'spot-iudex', la: 'iūdex', src: 'dcc-word', listen: 'Consonantal i = y: YŪ-deks; long ū; x = ks.' },
  { id: 'spot-signum', la: 'sīgnum', src: 'dcc-word', listen: 'gn = [ŋn], "SĪNG-num"; not the Italian "ny". Long ī (hidden quantity, as DCC marks it).' },
  { id: 'spot-civitas', la: 'cīvitās', src: 'dcc-word', listen: 'KĪ-wi-tās: hard c, v = w, both long vowels held.' },
  { id: 'spot-proelium', la: 'proelium', src: 'dcc-word', listen: 'oe as in "oil": PROY-li-um; three syllables after the diphthong.' },
  { id: 'spot-equus', la: 'equus', src: 'dcc-word', listen: 'E-kwus: qu is one consonant [kw]; short e.' },
  { id: 'spot-nihil', la: 'nihil', src: 'bank-form', listen: 'NI-hil with a light h — not "nil", not a rasp.' },
  { id: 'spot-deus', la: 'deus', src: 'dcc-word', listen: 'Two syllables, DE-us: no "dyoos", no diphthong.' },
  { id: 'spot-aether', la: 'aethēr', src: 'dcc-word', listen: 'AI-tʰēr: ae as in "eye"; th an aspirated t, not English th; long ē.' },
  // citations (new-word cards play the whole citation)
  { id: 'spot-cit-iacio', la: 'iaciō, iacere', src: 'dcc-citation', listen: 'Two forms with a short pause: YA-ki-ō, YA-ke-re. Hard c both times; long final ō.' },
  { id: 'spot-cit-rex', la: 'rēx, rēgis', src: 'dcc-citation', listen: 'rēks, RĒ-gis: long ē both times; hard g.' },
  // Historia tap-to-hear words (inflected, lower-cased as the app speaks them)
  { id: 'spot-h-rumores', la: 'rūmōrēsque', src: 'historia-word', listen: 'rū-mō-RĒS-kwe: -que pulls the stress to the syllable before it.' },
  { id: 'spot-h-excrucior', la: 'excrucior', src: 'historia-word', listen: 'eks-KRU-ki-or: hard c twice; short u.' },
  { id: 'spot-h-maiestate', la: 'maiestāte', src: 'historia-word', listen: 'Intervocalic i is doubled: mai-yes-TĀ-te.' },
  { id: 'spot-h-subiectis', la: 'subiectīs', src: 'historia-word', listen: 'Consonantal i after the prefix: sub-YEK-tīs.' },
  { id: 'spot-h-iactabit', la: 'iactābit', src: 'historia-word', listen: 'yak-TĀ-bit: initial i = y; long ā.' },
  { id: 'spot-h-conspicuus', la: 'cōnspicuus', src: 'historia-word', listen: 'kōn-SPI-ku-us: four syllables; uu is two vowels.' },
  { id: 'spot-h-uxorem', la: 'uxōrem', src: 'historia-word', listen: 'uk-SŌ-rem: x = ks; long ō.' },
  { id: 'spot-h-schola', la: 'scholā', src: 'historia-word', listen: 'SKʰO-lā: ch is an aspirated k (not "sh", not "ch"); long final ā.' },
  // sentence-bank sentences
  { id: 'spot-s-populus', la: 'Populus Rōmānus sapientiam laudat.', from: 's03-04', src: 'sentence', listen: 'rō-MĀ-nus, sa-pi-EN-ti-am: t before i stays t (no "sh").' },
  { id: 'spot-s-liber', la: 'Ubi est liber meus?', from: 's06-03', src: 'sentence', listen: 'Question intonation; ME-us two syllables; short i in liber.' },
  { id: 'spot-s-fugite', la: 'Fugite ex hōc locō!', from: 's10-06', src: 'sentence', listen: 'An exclamation; hard g in FU-gi-te; light h in hōc.' },
  { id: 'spot-s-iuvare', la: 'Magister discipulōs iuvāre poterat.', from: 's06-12', src: 'sentence', listen: 'yu-WĀ-re: consonantal i and v; dis-KI-pu-lōs with hard c.' },
  { id: 'spot-s-philosophia', la: 'Sine philosophiā errās.', from: 's02-04', src: 'sentence', listen: 'pʰi-lo-SO-pʰi-ā — aspirated p, never f; ER-rās with the double r held.' },
  { id: 'spot-s-graeci', la: 'Librī Graecī plēnī sapientiae sunt.', from: 's06-01', src: 'sentence', listen: 'GRAI-kī (ae as in "eye", hard c); sa-pi-EN-ti-ai.' },
  // longer lines
  { id: 'spot-l-tyranni', la: 'Ō dī, vitia tyrannī tolerāre nōn possumus!', src: 'lectio', listen: 'Lectiō. y in tyrannī is a French u [y]; WI-ti-a; double n and s held.' },
  { id: 'spot-l-fama', la: 'Propter carmina dē amōre fāma poētae nunc magna est.', src: 'lectio', listen: 'Lectiō. po-Ē-tai (o-ē two syllables); MAG-na with gn = [ŋn].' },
  { id: 'spot-hist-odi', la: 'ōdī et amō. quārē id faciam fortasse requīris nesciō, sed fierī sentiō et excrucior.', src: 'historia', listen: 'Catullus 85, as Historia speaks it (lower case). Elision is not expected; FA-ki-am, NES-ki-ō.' },
  { id: 'spot-hist-romane', la: 'tū regere imperiō populōs, rōmāne, mementō; hae tibi erunt artēs; pācisque impōnere mōrem, parcere subiectīs, et dēbellāre superbōs.', src: 'historia', listen: 'Aeneid 6.851–3, read as prose: PĀ-kis-kwe, sub-YEK-tīs; a steady pace to the end (no drift, no skipped words).' },
  // ph / th / ch
  { id: 'spot-ph-philosophia', la: 'philosophia', src: 'pack-word', listen: 'pʰi-lo-SO-pʰi-a: aspirated p twice, never English f.' },
  { id: 'spot-ph-theatrum', la: 'theātrum', listen: 'tʰe-Ā-trum: aspirated t, never the th of "thin".' },
  { id: 'spot-ph-pulcher', la: 'pulcher, pulchra, pulchrum', src: 'dcc-citation', listen: 'PUL-kʰer: ch is an aspirated k, not "ch" or "sh".' },
  { id: 'spot-ph-triumpho', la: 'triumphō', src: 'historia-word', listen: 'tri-UM-pʰō: aspirated p, not f.' },
];

export interface CompareGroup {
  id: 'voice' | 'spot';
  title: string;
  items: readonly CompareItem[];
  columns: readonly ColumnId[];
}

export const COMPARE_GROUPS: readonly CompareGroup[] = [
  { id: 'voice', title: 'Voice test', items: COMPARE_ITEMS, columns: ['espeak', 'openai:pseudo', 'openai:plain', 'gemini:plain', 'gemini:aspirated'] },
  { id: 'spot', title: 'Gemini spot-check', items: SPOT_ITEMS, columns: ['gemini:plain', 'gemini:aspirated'] },
];
