/**
 * Which texts have audio, and the text the app plays for each thing. Pure: the audio
 * pipeline (vocabula-content scripts/audio-manifest.mts) imports `audioItems` from here
 * when the app checkout has it, so the client and the clip store agree on every key.
 *
 * Items:
 *  - word:     each lemma's first citation form (amō, rosa, magnus; "-que" → que)
 *  - citation: the full citation when it has more than one form (rosa, rosae; amō, amāre; magnus, magna, magnum)
 *  - sentence: every bank sentence as printed (Puella rosam amat.)
 *  - form:     every distinct written word in the bank's sentences (rosam, puellaeque)
 *  - extra:    the voice-test page's items (src/compare/items.ts), so its eSpeak column has clips
 */
import type { Lemma } from '../morph/types.ts';
import { citation, type Lexicon } from '../engine/lexicon.ts';
import { latinText, tokenText, type Sentence } from '../engine/sentences.ts';
import { audioKey, normalizeAudioText } from './key.ts';
import { espeakInput } from './speech.ts';
import { COMPARE_ITEMS } from '../compare/items.ts';

export type AudioKind = 'word' | 'citation' | 'sentence' | 'form' | 'extra';
export interface AudioItem { key: string; text: string; kind: AudioKind; speak: string }
export interface AudioRef { key: string; text: string }

const ref = (text: string): AudioRef => ({ key: audioKey(text), text: normalizeAudioText(text) });

/** First citation form, as spoken (enclitic hyphen dropped). */
export function wordText(l: Lemma): string {
  return (l.parts[0] ?? l.headword).replace(/^-/, '');
}
export const wordAudio = (l: Lemma): AudioRef => ref(wordText(l));

/** The whole citation (rosa, rosae), or null when it is a single form. */
export function citationText(l: Lemma): string | null {
  const c = citation(l).replace(/(^|, )-/g, '$1');
  return c.includes(',') ? c : null;
}
/** What a new-word card plays: the citation when there is one, else the word. */
export const introAudio = (l: Lemma): AudioRef => ref(citationText(l) ?? wordText(l));

export const sentenceAudio = (s: Sentence): AudioRef => ref(latinText(s));
export const formAudio = (form: string): AudioRef => ref(form);

/** Texts with clips beyond the lexicon and the bank: the voice-test page's items. */
export const EXTRA_AUDIO_TEXTS: readonly string[] = COMPARE_ITEMS.map((i) => i.la);

/** Every clip the app may ask for, de-duplicated by key, in a stable order. */
export function audioItems(lex: Pick<Lexicon, 'words'>, sentences: readonly Sentence[], extra: readonly string[] = EXTRA_AUDIO_TEXTS): AudioItem[] {
  const out = new Map<string, AudioItem>();
  const add = (text: string, kind: AudioKind) => {
    const r = ref(text);
    if (!r.text || out.has(r.key)) return;
    out.set(r.key, { key: r.key, text: r.text, kind, speak: espeakInput(r.text) });
  };
  for (const w of lex.words) add(wordText(w.lemma), 'word');
  for (const w of lex.words) { const c = citationText(w.lemma); if (c) add(c, 'citation'); }
  for (const s of sentences) add(latinText(s), 'sentence');
  for (const s of sentences) for (const t of s.tokens) add(tokenText(t), 'form');
  for (const t of extra) add(t, 'extra');
  return [...out.values()];
}
