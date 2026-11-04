# Vocābula

A phone-first, offline-capable PWA for drilling Latin vocabulary and paradigms along *Wheelock's Latin*.

## What exists (milestone 1: foundation)

- **App shell**: Vite + TypeScript (strict) + Preact. Home screen is a placeholder ("Path coming soon.").
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

## Run

```sh
npm install
npm run dev          # dev server
npm test             # Vitest (all tests)
npm run build        # typecheck + production build with service worker → dist/
npm run preview      # serve dist/ (to try install / offline)
```

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
  engine/     (later) lesson sequencing, ts-fsrs scheduling, IndexedDB
  main.tsx    app entry
worker/       (later) Cloudflare Worker API
content/      data files
  private/    copyrighted textbook data: gitignored, NEVER committed
scripts/      CLI tools (import-wheelock.ts)
tests/        Vitest specs
public/       icons and static assets
```

## Rule: `content/private/` is never committed

Everything under `content/private/` (the raw Wheelock lists and the generated `wheelock.json`) is copyrighted textbook material. It is listed in `.gitignore` and must never be committed, pushed or bundled into a public build. Before committing, check with `git status --ignored`. Do not force-add (`git add -f`) anything under it.

## Not yet built

Lessons and path UI, ts-fsrs scheduling, IndexedDB persistence, the Worker sync API, 3rd–5th declensions, 3rd/4th conjugations, other tenses, pronouns.

## DCC core vocabulary

`npx tsx scripts/import-dcc.ts` turns `content/source/dcc-core-latin.json` (the DCC Latin Core
Vocabulary, CC BY-SA 3.0 — see `content/DCC-LICENSE.md`) into `content/dcc.json`, for the paradigms
implemented so far. Currently 365 of 997 entries; the rest wait for 3rd–5th declensions, 3rd/4th
conjugations, pronouns and irregulars. The importer reports every entry it can't expand or classify.

Spelling note: DCC marks some "hidden" vowel quantities that Wheelock does not (e.g. DCC *māgnus*,
Wheelock *magnus*). Of the 54 words in both Wheelock ch. 1–4 and DCC, this is the only difference.
Rule: when a word is in both, the app shows Wheelock's spelling.
