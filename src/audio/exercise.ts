/**
 * Which clip an exercise screen's speaker plays. `prompt`: safe to play before answering
 * (never gives the answer away: no speaker on English → Latin, produce, cloze, or a listening
 * exercise, which has its own play button); `answer`: in the feedback panel.
 */
import type { Exercise } from '../engine/lesson.ts';
import type { Lexicon } from '../engine/lexicon.ts';
import { formAudio, introAudio, sentenceAudio, type AudioRef } from './items.ts';
import { vocabSay } from '../engine/listening.ts';

export function exerciseAudio(ex: Exercise, lex: Pick<Lexicon, 'byId'>): { prompt: AudioRef | null; answer: AudioRef | null } {
  const lemma = (id: string) => lex.byId.get(id)?.lemma;
  switch (ex.type) {
    case 'grammar': return { prompt: null, answer: null };
    // Audītiō: a pre-teach card says its word (eSpeak, when the clip exists); the recording has its own player.
    case 'audit': return { prompt: ex.kind === 'word' && ex.vocab ? formAudio(vocabSay(ex.vocab)) : null, answer: null };
    case 'intro': { const l = lemma(ex.lemma); return { prompt: l ? introAudio(l) : null, answer: null }; }
    case 'sentence': {
      const a = sentenceAudio(ex.s);
      return { prompt: ex.kind === 'en' || ex.kind === 'subj' || ex.kind === 'obj' ? a : null, answer: a };
    }
    case 'choice': case 'typed': {
      if (ex.audio) return { prompt: null, answer: ex.audio };
      if (ex.kind === 'audit-q') return { prompt: null, answer: null };
      if (ex.kind === 'audit-word') { const a = formAudio(vocabSay({ headword: ex.cue })); return { prompt: a, answer: a }; }
      const l = lemma(ex.lemma);
      if (ex.kind === 'parse') { const a = formAudio(ex.cue); return { prompt: a, answer: a }; }
      if (ex.type === 'typed' && ex.kind === 'produce') return { prompt: null, answer: ex.accepted[0] ? formAudio(ex.accepted[0]) : null };
      const a = l ? introAudio(l) : null;
      return { prompt: ex.type === 'typed' ? null : a, answer: a };
    }
  }
}
