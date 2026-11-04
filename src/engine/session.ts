/**
 * A running lesson: the exercise queue, grading and requeueing of misses.
 * Pure and UI-free so it can be unit-tested.
 *
 * Rules:
 *  - only the first attempt at an exercise is graded (and becomes a review event);
 *  - a miss comes back REQUEUE_GAP exercises later as an ungraded retry
 *    (again on a retry miss, at most MAX_RETRIES times).
 */
import { compareAnswer, type Comparison } from './util.ts';
import { isScored, type ChoiceExercise, type Exercise, type GradedExercise, type TypedExercise } from './lesson.ts';
import { checkSentence } from './sentences.ts';
import type { Grade } from './srs.ts';

export const REQUEUE_GAP = 3;
export const MAX_RETRIES = 2;

export interface QueueItem { ex: Exercise; retry: number }

export interface Outcome {
  ok: boolean;
  macronMiss: boolean;
  /** Set on a graded (first) attempt. */
  grade?: Grade;
  card?: string;
  expected: string;
}

export class Session {
  queue: QueueItem[];
  pos = 0;
  readonly total: number;
  graded = 0;
  firstTryCorrect = 0;
  reviews: { card: string; grade: Grade }[] = [];

  constructor(exercises: readonly Exercise[]) {
    this.queue = exercises.map((ex) => ({ ex, retry: 0 }));
    this.total = exercises.length;
  }

  get current(): QueueItem | undefined { return this.queue[this.pos]; }
  get done(): boolean { return this.pos >= this.queue.length; }
  get progress(): number { return this.queue.length ? this.pos / this.queue.length : 1; }

  /** Check an answer for the current exercise and record the outcome. */
  answer(response: string[] | string): Outcome {
    const item = this.current;
    if (!item || !isScored(item.ex)) throw new Error('no graded exercise at this position');
    const ex = item.ex;
    const res = ex.type === 'choice' ? checkChoice(ex, response as string[])
      : ex.type === 'sentence' ? checkSentence(ex, typeof response === 'string' ? [response] : response)
      : checkTyped(ex, response as string);
    const out: Outcome = { ok: res.ok, macronMiss: res.macronMiss, expected: res.expected };
    if (item.retry === 0) {
      const grade: Grade = res.ok ? 'good' : 'again';
      this.graded++;
      if (res.ok) this.firstTryCorrect++;
      this.reviews.push({ card: ex.card, grade });
      out.grade = grade;
      out.card = ex.card;
    }
    if (!res.ok && item.retry < MAX_RETRIES) {
      const at = Math.min(this.pos + 1 + REQUEUE_GAP, this.queue.length);
      this.queue.splice(at, 0, { ex, retry: item.retry + 1 });
    }
    return out;
  }

  /**
   * Replace the current, not yet answered exercise (a listening exercise whose clip can't be
   * played → its non-audio fallback). Nothing is graded for the replaced one.
   */
  swapCurrent(ex: Exercise): void {
    const item = this.current;
    if (item) this.queue[this.pos] = { ex, retry: item.retry };
  }

  /** Move past the current exercise (after feedback, or after an intro / grammar card). */
  advance(): void { if (!this.done) this.pos++; }
}

export function checkChoice(ex: ChoiceExercise, picked: readonly string[]): Comparison {
  const a = [...new Set(picked)].sort().join('|');
  const b = [...ex.answer].sort().join('|');
  const expected = ex.options.filter((o) => ex.answer.includes(o.id)).map((o) => o.text).join('; ');
  return { ok: a === b, macronMiss: false, expected };
}

export function checkTyped(ex: TypedExercise, typed: string): Comparison {
  return compareAnswer(typed, ex.accepted);
}

export type { GradedExercise };
