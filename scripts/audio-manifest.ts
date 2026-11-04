/**
 * Print the audio manifest: one JSON line per clip, {key, text, kind, speak}.
 * `speak` is the pre-processed text given to eSpeak NG (src/audio/speech.ts).
 *
 *   npx tsx scripts/audio-manifest.ts [vocabula-pack.json] > audio-manifest.jsonl
 *
 * Default pack: content/private/vocabula-pack.json. The clips themselves are generated
 * and uploaded by the private content repo's GitHub Action (vocabula-content
 * .github/workflows/audio.yml), which imports `audioItems` from this checkout.
 * The manifest holds Wheelock-derived words: never commit its output here.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePack } from '../src/data/pack.ts';
import { parseLemmaList } from '../src/data/loader.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { parseSentences, type Sentence } from '../src/engine/sentences.ts';
import { EXTRA_AUDIO_TEXTS, audioItems } from '../src/audio/items.ts';
import { parseListeningLesson, vocabSay } from '../src/engine/listening.ts';
import { lectioText, parseLectioFile } from '../src/engine/lectio.ts';

const ROOT = resolve(import.meta.dirname, '..');

/** Every bank sentence, read from content/sentences/s*.json (the bundle uses import.meta.glob). */
export function readSentenceBank(root = ROOT): Sentence[] {
  const dir = resolve(root, 'content/sentences');
  return readdirSync(dir).filter((f) => /^s.*\.json$/.test(f)).sort()
    .flatMap((f) => parseSentences(JSON.parse(readFileSync(resolve(dir, f), 'utf8'))));
}

/**
 * eSpeak clips for the Audītiō pre-teach words (content/listening/*.json), spoken on their
 * new-word cards. The lessons' recordings themselves are human readings with their own keys.
 */
export function listeningWordTexts(root = ROOT): string[] {
  const dir = resolve(root, 'content/listening');
  return readdirSync(dir).filter((f) => /^listen-.*\.json$/.test(f)).sort()
    .flatMap((f) => parseListeningLesson(JSON.parse(readFileSync(resolve(dir, f), 'utf8'))).vocab.filter((v) => v.drill).map(vocabSay));
}

/**
 * eSpeak clips for every Lectiō sentence (content/lectio/s*.json), as printed: each sentence of a
 * reading passage has a speaker. Passed as extra texts, after the Audītiō words.
 */
export function lectioTexts(root = ROOT): string[] {
  const dir = resolve(root, 'content/lectio');
  return readdirSync(dir).filter((f) => /^s.*\.json$/.test(f)).sort()
    .flatMap((f) => parseLectioFile(JSON.parse(readFileSync(resolve(dir, f), 'utf8')))).flatMap((p) => p.sentences.map(lectioText));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (isMain) {
  const file = resolve(process.argv[2] ?? resolve(ROOT, 'content/private/vocabula-pack.json'));
  const pack = parsePack(JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')));
  const dcc = parseLemmaList(JSON.parse(readFileSync(resolve(ROOT, 'content/dcc.json'), 'utf8')));
  const lex = buildLexicon(pack.lemmas, dcc, pack.fr ?? []);
  const items = audioItems(lex, readSentenceBank(), [...EXTRA_AUDIO_TEXTS, ...listeningWordTexts(), ...lectioTexts()]);
  process.stdout.write(items.map((i) => JSON.stringify(i)).join('\n') + '\n');
  const by = items.reduce<Record<string, number>>((a, i) => ({ ...a, [i.kind]: (a[i.kind] ?? 0) + 1 }), {});
  process.stderr.write(`${items.length} clips: ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ')}\n`);
}
