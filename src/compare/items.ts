/**
 * The voice-test items (#/compare): short Latin chosen to expose how a TTS engine handles
 * restored classical pronunciation (W. S. Allen, *Vox Latina*). Each has a note on what to
 * listen for. Sentences marked `from` are taken verbatim from content/sentences.
 */
export interface CompareItem {
  id: string;
  /** Latin with macrons, as sent to the engines (plain variant). */
  la: string;
  /** What to listen for. */
  listen: string;
  /** Sentence-bank id, when the text comes from content/sentences. */
  from?: string;
}

export const COMPARE_ITEMS: readonly CompareItem[] = [
  { id: 'c-hard', la: 'Cicerō, Caesar, centum', listen: 'c is always [k]: KI-ke-rō, KAI-sar, KEN-tum — never s or ch.' },
  { id: 'v-w', la: 'vīnum, virī, vōx', listen: 'Consonantal v is English w: WĪ-num, WI-rī, wōks.' },
  { id: 'ae-oe', la: 'caelum, poena, Graecia', listen: 'ae as in "eye", oe as in "oil": KAI-lum, POI-na. Not "ee".' },
  { id: 'qu-ngu', la: 'quis, aqua, lingua', listen: 'qu = [kw] in one consonant; ngu before a vowel = [ngw]: LIN-gwa.' },
  { id: 'gn', la: 'magnus, dignus, agnus', listen: 'g stays hard before n (Allen: [ŋn], "mang-nus"); not the Italian/French "ny".' },
  { id: 'g-hard', la: 'genus, gēns, legiō', listen: 'g is always hard [g], even before e and i: GE-nus, not "jenus".' },
  { id: 'malum', la: 'mālum, malum', listen: 'Length minimal pair: MĀ-lum (apple), long ā held; MA-lum (evil), short a.' },
  { id: 'liber', la: 'līber, liber', listen: 'LĪ-ber (free) with a long ī; LI-ber (book) with a short i.' },
  { id: 'populus', la: 'populus, pōpulus', listen: 'PO-pu-lus (people) short o; PŌ-pu-lus (poplar) long ō. Same stress, different length.' },
  { id: 'cons-i', la: 'iam, Iūlius, cuius, huius', listen: 'Initial i before a vowel = English y (yam, YŪ-li-us); between vowels doubled: KUY-yus, HUY-yus.' },
  { id: 'h', la: 'hodiē, mihi, homō', listen: 'h is a light breath, not dropped and not a rasp: HO-di-ē, MI-hi.' },
  { id: 'ph-th', la: 'philosophia, theātrum', listen: 'ph and th are aspirated p and t (pʰ, tʰ), not English f and θ.' },
  { id: 'gemination', la: 'anus, annus; ille, īle', listen: 'Double consonants are held: AN-nus (year) vs A-nus (old woman), IL-le.' },
  { id: 'stress', la: 'amāre, agricola, cēnābimus', listen: 'Penult law: a-MĀ-re (long penult), a-GRI-co-la and cē-NĀ-bi-mus (short penult → antepenult).' },
  { id: 's1', la: 'Puella rosās amat.', listen: 'Plain sentence: final -s unvoiced (not "z"), intervocalic s voiceless in rosās.', from: 's02-01' },
  { id: 's2', la: 'Virī avārī pecūniam semper amant.', listen: 'w in virī; long ī, ū; stress pe-KŪ-ni-am.', from: 's03-03' },
  { id: 's3', la: 'Caelum pulchrum est.', listen: 'KAI-lum; ch in pulchrum is [kʰ], not "ch"/"sh".', from: 's05-11' },
  { id: 's4', la: 'Vērī amīcī semper iuvant.', listen: 'w in vērī; consonantal i in iuvant = YU-want.', from: 's04-11' },
  { id: 's5', la: 'Cīvitās pācem nōn habēbat.', listen: 'KĪ-wi-tās, PĀ-kem — hard c twice; long vowels held.', from: 's07-04' },
  { id: 'aeneid', la: 'Arma virumque canō, Trōiae quī prīmus ab ōrīs', listen: 'Vergil, Aen. 1.1, read as prose: wi-RUM-kwe, KA-nō, TRŌY-yai, kwī.' },
  { id: 'gallia', la: 'Gallia est omnis dīvīsa in partēs trēs.', listen: 'Caesar, BG 1.1: GAL-li-a (double l), dī-WĪ-sa, long ē in partēs/trēs.' },
];
