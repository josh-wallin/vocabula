# Vocābula

A phone-first, offline-capable PWA for drilling Latin vocabulary and paradigms along *Wheelock's Latin*.

## What exists (milestone 1: foundation)

- **App shell**: Vite + TypeScript (strict) + Preact.
- **PWA**: `vite-plugin-pwa` (Workbox `generateSW`). Manifest: name "Vocābula", theme `#5e2550`, background `#eceeea`. The service worker precaches the app shell (HTML, JS, CSS, icons), so the app opens offline. Cinzel / EB Garamond / Figtree load from Google Fonts when online (cached at runtime) and fall back to system serif/sans fonts otherwise.
- **`src/morph`**: a pure morphology library (no UI):
  - `generate(lemma)`: every supported form, keyed by cell id (`nom.sg`, `acc.pl.f`, `pres.act.ind.3pl`, `pres.act.inf`, `pres.act.imp.2sg`, …). Paradigms: `v1`, `v2` (present active indicative, infinitive, imperatives), `n1`, `n2m` (-us, -er keeping/dropping e, -ir, -ius), `n2n` (-um, -ium), `adj12` (-us/-a/-um and -er/-(e)ra/-(e)rum; plural-only like *paucī*), `irr:sum`, `indecl`.
  - Vowel quantity: a long vowel shortens before another vowel, before final -m/-r/-t, and before nt/nd. 1st-conj. 1sg contracts (*laudō*). Lexical exceptions sit in `lemma.irregular` (e.g. *dō*: *dās*, *dā*; *meus*: voc. *mī*; *fīlia*: *fīliābus*), drawn from `src/morph/irregulars.ts`.
  - `inferParadigm(headword, pos)`: paradigm + stem from a dictionary headword, with `confidence` (`high` / `low` / `none`) and a `reason` when it can't decide (for example, 3rd declension: not implemented yet).
  - `analyze(form, lemmas)` / `FormIndex`: every `{lemma, cell}` that produces a form (*puellae* → gen.sg, dat.sg, nom.pl, voc.pl). Macrons count by default; `ignoreMacrons` is optional.
  - `citationForms` / `citationMismatches`: regenerate a headword's printed forms to check inference.
- **`src/data`**: content types, a lemma-list loader, and `importWheelock()` (pure conversion of raw list entries into `Lemma[]`).
- **`scripts/import-wheelock.ts`**: CLI wrapper that writes `content/private/wheelock.json` and lists unclassified entries, low-confidence guesses and citation-form mismatches.
- **Tests (Vitest)**: full textbook paradigms with macrons, inference on 25+ headwords plus refusals, `analyze`, and the Wheelock ch. 1–4 import check.

## Milestone 3: path, lessons, scheduling

- **Screens**: first-run pack import (file picker + paste fallback) → **Path** (one zigzag path, Sectiō I–IV, sequential unlock, completed nodes replayable, book button opens the section's grammar chapter) → **Lesson** (progress bar, × quits without completing the node) → **Lectiō perfecta** (puncta, first-try accuracy, streak, words coming back, Iter Latinum code). Tabs: Path, Practice (an ad-hoc Repetītiō), Words (words met so far), Profile (stats, backup export/import, content pack replace, About & credits with DCC attribution).
- **Section template** (`src/engine/path.ts`): Verba I (≤6 new words) → Coniugātiō/Dēclīnātiō (grammar card + drills) → more Verba → Fōrmae → Plūra verba · DCC (≤12 newly eligible DCC words, most frequent first, 6 per lesson) with a Repetītiō after every 3 lessons and a closing Repetītiō; Probātiō (20 exercises) after section 4. Words in both lists are taught once, in Wheelock's spelling (match: macron-stripped first form + paradigm).
- **Features** (`src/engine/curriculum.ts`): each section unlocks lexical features at its start (conjugation class; m/f gender; neuter) and paradigm features at its pattern node (ch1 present ind./inf./imp.; ch2 1st decl., adj. fem., *est*; ch3 2nd decl. masc., adj. masc.; ch4 2nd decl. neuter, adj. neut., full *sum*). Exercises only use cells whose feature is unlocked.
- **Exercises** (`src/engine/lesson.ts`): new-word card; Latin→English multiple choice (same-POS distractors, known words first, no overlapping glosses); English→Latin typed (only after 2 correct meaning reviews); gender / conjugation tap; parse (select all that fit when `analyze()` gives several cells); produce ("Give the genitive plural of …"). Lessons 10–12 exercises, Repetītiō 13, Probātiō 20. Typed answers: NFC, trimmed, case-insensitive; macrons optional (a macron-only difference is correct, with the spelling shown).
- **Session** (`src/engine/session.ts`): only first attempts are graded; a miss returns 3 exercises later, ungraded (up to 2 retries).
- **Scheduling** (`src/engine/srs.ts`): ts-fsrs 5.4.2 (fuzz off, for deterministic replay). Cards: `{lemma}:meaning`, `{lemma}:recall`, `{lemma}:class`, `{lemma}:forms:{featureId}`. First attempt right → `Rating.Good`, wrong → `Rating.Again`. Repetītiō takes due cards by lowest retrievability, reserves room for recent misses, then fills with new card kinds and weakest cards.
- **Events** (`src/engine/events.ts`, `src/data/db.ts`): IndexedDB (idb) append-only log `{id, device, ts, kind: 'review'|'node_done'|'setting', card?, grade?, body?, outbox}`. Every derived value (FSRS cards, progress, streak, puncta) is a replay sorted by `(ts, id)`, so the same events in any order give the same state. `outbox: 1` marks events not yet sent to the future sync server.
- **Puncta**: +10 per finished lesson, +2 per first-try-correct review.
- **Streak**: local calendar days with ≥1 finished lesson; today not yet practised doesn't break it; up to 2 missed days per Monday-based week are bridged by freezes (they keep the streak but don't add to it).
- **Backup**: Profile → Export writes `{format:'vocabula-events', version:1, events}`; Import merges by event id (idempotent).
- **Glossary** (`src/content/glossary.ts`): 24 terms, each tied to the section that unlocks it; grammar cards (`src/content/grammarCards.ts`) render terms as dotted-underline buttons that open a bottom sheet, only once the term's section is reached.
- **Offline**: all JS/CSS/HTML (including the DCC list and grammar chapters, which are bundled) is precached by the service worker; content and progress live in IndexedDB.

### The private content pack

```sh
npx tsx scripts/import-wheelock.ts     # → content/private/wheelock.json
npm run build:pack                     # → content/private/vocabula-pack.json (gitignored)
```

On first run the app asks for this file (or its pasted text), checks `format`, `schema` and the per-chapter counts, and stores it in IndexedDB. Profile can replace it. `src/data/contentStore.ts` is the only module that loads content, so a later authenticated sync API can replace the import without touching the rest of the app.

### Iter Latinum sync code

The complete screen (and Profile) shows a code covering **all of today's practice**:

```
VOC1-<payload>-<check>
payload = base64url(JSON.stringify({"d":"2026-11-03","l":2,"n":12,"r":40}))   // no padding
check   = first 6 hex digits of FNV-1a-32 over the UTF-16 code units of "VOC1-" + payload
d = local date, l = lessons finished, n = new words introduced, r = graded reviews
```

`decodeSyncCode()` in `src/engine/syncCode.ts` is the reference decoder (rejects a wrong prefix, checksum or shape).

## Run

```sh
npm install
npm run dev          # dev server
npm test             # Vitest (all tests)
npm run build        # typecheck + production build with service worker → dist/
npm run preview      # serve dist/ (to try install / offline)
npm run test:e2e     # headless Chrome smoke test against dist/ (run after build; skips without the private pack)
```

The e2e test (`e2e/smoke.e2e.ts`, playwright-core + system Chrome, `CHROME_PATH` to override) serves `dist/`, imports the private pack, plays the first Verba lesson through the DOM (missing one answer on purpose), checks the node stays done after reload, then goes offline, reloads, and plays the next lesson.

Import the Wheelock lists (you supply the private source file):

```sh
mkdir -p content/private/source
cp /path/to/vocab_ch1-4.json content/private/source/
npx tsx scripts/import-wheelock.ts            # → content/private/wheelock.json
# or: npx tsx scripts/import-wheelock.ts <input.json> <output.json>
```

The script exits non-zero if any generated citation form disagrees with the printed headword. It reports the disagreement and never "fixes" it silently. The import test (`tests/wheelock-import.test.ts`) is **skipped** when the private source file is absent, so a fresh clone still passes `npm test`.

## Folder layout

```
src/
  morph/      form generation, paradigm inference, analysis (pure functions)
  data/       content types, loaders, Wheelock import (pure)
  ui/         Preact screens and styles
  engine/     curriculum, path, lessons, session, FSRS, events/replay, backup, sync code (pure)
  content/    glossary and grammar cards (original writing)
  app/        controller: content + event log → derived state
  main.tsx    app entry
worker/       (later) Cloudflare Worker API
content/      data files
  private/    copyrighted textbook data: gitignored, NEVER committed
scripts/      CLI tools (import-wheelock.ts, import-dcc.ts, build-pack.ts)
e2e/          headless browser smoke test
tests/        Vitest specs
public/       icons and static assets
```

## Rule: `content/private/` is never committed

Everything under `content/private/` (the raw Wheelock lists, the generated `wheelock.json` and `vocabula-pack.json`) is copyrighted textbook material. It is listed in `.gitignore` and must never be committed, pushed or bundled into a public build. Before committing, check with `git status --ignored`. `tests/no-private-in-dist.test.ts` fails if any Wheelock-only gloss appears in `dist/`. Do not force-add (`git add -f`) anything under it.

## Not yet built

The Worker sync API (and replacing pack import with it), sections beyond 4, 3rd–5th declensions, 3rd/4th conjugations, other tenses, pronouns, sentence exercises, dark mode.

## DCC core vocabulary

`npx tsx scripts/import-dcc.ts` turns `content/source/dcc-core-latin.json` (the DCC Latin Core
Vocabulary, CC BY-SA 3.0 — see `content/DCC-LICENSE.md`) into `content/dcc.json`, for the paradigms
implemented so far. Currently 365 of 997 entries; the rest wait for 3rd–5th declensions, 3rd/4th
conjugations, pronouns and irregulars. The importer reports every entry it can't expand or classify.

Spelling note: DCC marks some "hidden" vowel quantities that Wheelock does not (e.g. DCC *māgnus*,
Wheelock *magnus*). Of the 54 words in both Wheelock ch. 1–4 and DCC, this is the only difference.
Rule: when a word is in both, the app shows Wheelock's spelling.
