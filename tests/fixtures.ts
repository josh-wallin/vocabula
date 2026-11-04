/**
 * A tiny invented content pack for engine tests. Not Wheelock data: the
 * words are common Latin, but chapter assignments and glosses are made up here.
 */
import type { Lemma, PartOfSpeech } from '../src/morph/types.ts';
import { lemmaFromHeadword } from '../src/morph/lemma.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { buildPath } from '../src/engine/path.ts';

function W(chapter: number, order: number, headword: string, pos: PartOfSpeech, gloss: string): Lemma {
  const { lemma, inference } = lemmaFromHeadword(headword, pos, gloss, [{ book: 'wheelock', chapter, order }]);
  if (!lemma) throw new Error(`fixture: ${headword}: ${inference.reason}`);
  return lemma;
}
function D(rank: number, headword: string, pos: PartOfSpeech, gloss: string): Lemma {
  const { lemma } = lemmaFromHeadword(headword, pos, gloss, []);
  if (!lemma) throw new Error(`fixture: ${headword}`);
  return { ...lemma, dcc: { rank, headword } };
}

export const FIX_WHEELOCK: Lemma[] = [
  W(1, 1, 'ambulō, ambulāre', 'verb', 'walk about'),
  W(1, 2, 'habitō, habitāre', 'verb', 'dwell'),
  W(1, 3, 'rīdeō, rīdēre', 'verb', 'laugh'),
  W(1, 4, 'sedeō, sedēre', 'verb', 'sit'),
  W(1, 5, 'nunc', 'adv', 'now'),
  W(1, 6, 'clāmō, clāmāre', 'verb', 'shout'),
  W(1, 7, 'lūceō, lūcēre', 'verb', 'shine'),
  W(1, 8, 'nārrō, nārrāre', 'verb', 'tell'),
  W(2, 1, 'casa, casae, f.', 'noun', 'hut'),
  W(2, 2, 'stella, stellae, f.', 'noun', 'star'),
  W(2, 3, 'incola, incolae, m.', 'noun', 'inhabitant'),
  W(2, 4, 'lūna, lūnae, f.', 'noun', 'moon'),
  W(2, 5, 'altus, alta, altum', 'adj', 'high'),
  W(2, 6, 'sed', 'conj', 'but'),
  W(3, 1, 'hortus, hortī, m.', 'noun', 'garden'),
  W(3, 2, 'liber, librī, m.', 'noun', 'book'),
  W(3, 3, 'lupus, lupī, m.', 'noun', 'wolf'),
  W(3, 4, 'novus, nova, novum', 'adj', 'new'),
  W(4, 1, 'saxum, saxī, n.', 'noun', 'rock'),
  W(4, 2, 'templum, templī, n.', 'noun', 'temple'),
  W(4, 3, 'sum, esse', 'verb', 'be'),
  W(4, 4, 'dōnum, dōnī, n.', 'noun', 'gift'),
];

export const FIX_DCC: Lemma[] = [
  D(1, 'nova, novae, f.', 'noun', 'invented duplicate noun'), // different paradigm from adj novus: not a duplicate
  D(2, 'novus, nova, novum', 'adj', 'new (DCC)'),            // duplicate of Wheelock novus → merged
  D(3, 'parō, parāre', 'verb', 'prepare'),                   // needs v12 → section 1
  D(4, 'aqua, aquae, f.', 'noun', 'water'),                  // needs n1 + gender.mf → section 2
  D(5, 'caelum, caelī, n.', 'noun', 'sky'),                  // needs n2n + gender.n → section 4
  D(6, 'longus, longa, longum', 'adj', 'long'),              // needs all adj genders → section 4
  D(7, 'equus, equī, m.', 'noun', 'horse'),                  // n2m → section 3
  D(8, 'māgnus, māgna, māgnum', 'adj', 'great'),
  // 14 invented 1st-conjugation verbs (more than the 12-per-section cap).
  ...['bal', 'cal', 'dal', 'fal', 'gal', 'hal', 'mal', 'nal', 'pal', 'ral', 'sal', 'tal', 'val', 'zal']
    .map((s, i) => D(10 + i, `${s}ō, ${s}āre`, 'verb', `invented verb ${i}`)),
];

export const fixLexicon = () => buildLexicon(FIX_WHEELOCK, FIX_DCC);
export const fixPath = () => buildPath(fixLexicon());
