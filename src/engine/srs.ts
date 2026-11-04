/** ts-fsrs wrapper. Fuzz is off so replaying the same events always yields the same schedule. */
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card } from 'ts-fsrs';

export type Grade = 'good' | 'again';
export { Rating, State, type Card };

const scheduler = fsrs(generatorParameters({ enable_fuzz: false, enable_short_term: true }));

export const ratingOf = (g: Grade): Rating.Good | Rating.Again => (g === 'good' ? Rating.Good : Rating.Again);

/** Apply one graded review. A card seen for the first time starts empty at the review time. */
export function review(card: Card | undefined, at: Date, grade: Grade): Card {
  const c: Card = card ?? createEmptyCard<Card>(at);
  return scheduler.next(c, at, ratingOf(grade)).card;
}

/** Probability of recall now (0 for a card that has never been reviewed). */
export function retrievability(card: Card, now: Date): number {
  if (card.state === State.New) return 0;
  return scheduler.get_retrievability(card, now, false);
}

export const isDue = (card: Card, now: Date): boolean => card.due.getTime() <= now.getTime();

/** Card id helpers: {lemma}:meaning, {lemma}:recall, {lemma}:class, {lemma}:forms:{featureId}. */
export type CardKind = 'meaning' | 'recall' | 'class' | 'forms';
export const cardId = (lemma: string, kind: CardKind, feature?: string): string =>
  kind === 'forms' ? `${lemma}:forms:${feature}` : `${lemma}:${kind}`;

export function parseCardId(id: string): { lemma: string; kind: CardKind; feature?: string } | null {
  const [lemma, kind, feature] = id.split(':');
  if (!lemma || !kind) return null;
  if (kind === 'forms') return feature ? { lemma, kind, feature } : null;
  if (kind === 'meaning' || kind === 'recall' || kind === 'class') return { lemma, kind };
  return null;
}
