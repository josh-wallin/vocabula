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
- **Events** (`src/engine/events.ts`, `src/data/db.ts`): IndexedDB (idb) append-only log `{id, device, ts, kind: 'review'|'node_done'|'setting', card?, grade?, body?, outbox}`. Every derived value (FSRS cards, progress, streak, puncta) is a replay sorted by `(ts, id)`, so the same events in any order give the same state. `outbox: 1` marks events not yet accepted by the sync server.
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

On first run the app offers **Sign in & download** (the pack from the sync server, below) and, as fallbacks, this file or its pasted text. Either way it checks `format`, `schema` and the per-chapter counts (`parsePack`, the same validator the Worker uses) and stores the pack in IndexedDB with its SHA-256 hash. Profile can replace it. `src/data/contentStore.ts` is the only module that loads content.

### Iter Latinum sync code

The complete screen (and Profile) shows a code covering **all of today's practice**:

```
VOC1-<payload>-<check>
payload = base64url(JSON.stringify({"d":"2026-11-03","l":2,"n":12,"r":40}))   // no padding
check   = first 6 hex digits of FNV-1a-32 over the UTF-16 code units of "VOC1-" + payload
d = local date, l = lessons finished, n = new words introduced, r = graded reviews
```

`decodeSyncCode()` in `src/engine/syncCode.ts` is the reference decoder (rejects a wrong prefix, checksum or shape).

## Milestone 4: sync server (Worker + D1 + Access)

### Architecture

```
browser (PWA, IndexedDB event log + outbox)
   │  same origin, cookies from Cloudflare Access
   ▼
Cloudflare Access (whole Worker, incl. workers.dev and static assets)
   ▼
Worker "vocabula"
   ├─ /api/*  → worker/index.ts → worker/api.ts  (assets.run_worker_first: ["/api/*"])
   │            └─ D1 "vocabula" (binding DB): packs, events
   └─ everything else → dist/ static assets, SPA fallback (binding ASSETS)
```

- Access enforces sign-in at the edge. Inside the Worker every `/api/*` request is checked again: `ctx.access` must exist, `ctx.access.aud` must equal the `ACCESS_AUD` var, and `await ctx.access.getIdentity()` must return an email in `ALLOWED_EMAILS` (comma-separated, case-insensitive). Anything else is `403 {"error":"forbidden"}`.
- The deploy pipeline runs no migrations: the Worker runs `CREATE TABLE IF NOT EXISTS …` once per isolate (`worker/schema.ts`, memoized). `migrations/0001_init.sql` is the same SQL for reference (a test keeps them identical).
- Shared code: `parsePack`/`packHash` (`src/data/pack.ts`), `parseEvent` (`src/engine/eventShape.ts`) and the wire types (`src/sync/protocol.ts`) are imported by both the client and the Worker. The Worker bundle (~13 KB) contains nothing else from the client.
- Types: `worker/tsconfig.json` checks the Worker against Wrangler-generated runtime types (`worker/types/worker-configuration.d.ts`; regenerate with `npm run types:worker` after changing `wrangler.jsonc`). The handlers themselves use small local interfaces (`worker/d1.ts`, `ApiCtx`), so tests run them in Node.

### API (JSON; every route needs the allowed Access identity)

| Route | |
|---|---|
| `GET /api/me` | `{email}`. With `?return=/path` it 302s to that same-origin path instead (used by "Sign in again"). |
| `GET /api/pack` | The stored pack, `ETag: "<sha256>"`. `If-None-Match` → `304`. No pack → `404 {"error":"no pack"}`. |
| `PUT /api/pack` | Body: a pack (≤ 2 MB), validated with `parsePack` (`422` with the reason if invalid). Stored as the single row of `packs`. Returns `{hash, id, lemmas, updatedAt}`. |
| `GET /api/pack/status` | `{present, hash?, id?, lemmas?, updatedAt?}` for Profile. |
| `POST /api/events` | `{events: VEvent[]}`, ≤ 500 per request, each validated with `parseEvent`. One D1 batch of `INSERT OR IGNORE` (idempotent by event id). Returns `{accepted, cursor}` (`cursor` = max `seq`). |
| `GET /api/events?after=<seq>&limit=1000` | `{events: [...each with seq], cursor, more}`, ordered by `seq`. `limit` is clamped to 1–1000. |

Events on the wire are exactly the client's `VEvent` (`{id, device, ts (ms, integer), kind, card?, grade? ('good'|'again'), body?}`), without the device-local `outbox` flag. Table `events(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, device, ts INTEGER, kind, card, grade TEXT, body TEXT (JSON), received_at)`. `seq` increases but may skip values (ignored duplicates can consume AUTOINCREMENT numbers); clients only rely on order.

### Client

- **Pack**: on start (once content is loaded, never blocking it) the app calls `GET /api/pack` with `If-None-Match` of the stored pack's hash. A different pack is validated and stored, unless the device's pack has a newer `builtAt` (e.g. imported but not yet uploaded); progress is untouched either way. Profile → **Cloud** shows the server pack (present/absent, words, updated, same as this device or not) and **Upload this device's pack to the cloud** (`PUT /api/pack`).
- **Sync loop** (`src/sync/sync.ts`): runs on start, on `online`, when the page becomes visible, after a lesson ends or is quit, from Profile → Sync now, and every 5 minutes while visible. It POSTs the outbox in chunks of 500 (oldest first) and clears `outbox` only for chunks that got a 2xx, then GETs `/api/events?after=<cursor>` until `more` is false, appends events whose id it doesn't have, and stores the cursor (IndexedDB `meta.syncCursor`). If anything new arrived, the app re-reads the log and replays (deferred until the current lesson ends). Failures back off exponentially (15 s doubling, max 15 min); nothing is thrown to the UI.
- **Status chip** (top bar): `Offline` / `Syncing…` / `Synced` / `N queued` (`Not synced` after an error with nothing queued), or a `Sign in` button when the session has expired.
- **Expired session**: Access protects static assets too, but the service worker serves the app shell from cache, so an expired session first shows up on `/api` calls. Those use `fetch(…, {redirect: 'manual'})`; Access's redirect to its login page then arrives as an `opaqueredirect` response. That, any 3xx, 401/403, or a 2xx that isn't JSON counts as "session expired". **Sign in again** does a full navigation to `/api/me?return=/`: Access sends the browser through login and back, and the Worker redirects to `/`.
- **Service worker**: `navigateFallbackDenylist` has `/^\/api\//` and `/^\/cdn-cgi\//` (Access's `/cdn-cgi/access/authorized` and `/logout` live on the app origin), and both prefixes are `NetworkOnly` (never precached or cached).

### How state converges

Every device keeps the same append-only log of events with globally unique ids. The server stores each id once; each device eventually holds every event (its own plus everything after its cursor). All derived state (FSRS cards, progress, streak, puncta, settings) is `replay(events)`, which sorts by `(ts, id)` and de-duplicates by id, so two devices with the same set of events compute identical state, whatever order the events arrived in. A setting changed on two devices resolves to the later `ts` (ties by id). Tests: `tests/sync.test.ts` (devices exchanging events in different orders through the real handlers), `e2e/sync.e2e.ts` (two browsers).

### One-time setup

1. **Access**: Workers & Pages → vocabula → Access: enable it for all traffic with a policy allowing only your email. Copy the application's AUD tag into `ACCESS_AUD` in `wrangler.jsonc` (already set for the current app). Without Access, `ctx.access` is absent and every `/api` call is 403.
2. **Allowed email**: `ALLOWED_EMAILS` in `wrangler.jsonc` `vars` (comma-separated). Changing it is a commit + deploy.
3. **D1**: database `vocabula` is bound as `DB`; tables are created on the first API call. Optionally `npx wrangler d1 migrations apply vocabula --remote`.
4. **Pack**: on a device that has the file, import it, then Profile → **Upload this device's pack to the cloud**. Other devices then use **Sign in & download**.

Local full stack: `npm run build && npm run dev:worker` (`wrangler dev` serves `dist/` plus the API with local D1; the `access.dev` block in `wrangler.jsonc` simulates the Access identity).

## Run

```sh
npm install
npm run dev          # dev server
npm test             # Vitest (all tests)
npm run build        # typecheck + production build with service worker → dist/
npm run preview      # serve dist/ (to try install / offline)
npm run test:e2e     # headless Chrome: smoke test + sync test against dist/ (run after build; skip without the private pack)
npm run typecheck    # client (tsconfig.json) and Worker (worker/tsconfig.json)
npm run dev:worker   # wrangler dev: dist/ + /api with local D1 and simulated Access
```

`e2e/sync.e2e.ts` serves `dist/` together with the real Worker handlers (over the node:sqlite D1 fake used by the unit tests) and drives two browser contexts through upload, download, cross-device progress, an expired session and re-login, and an offline lesson synced on reconnect.

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
  sync/       client sync: fetch wrapper, sync loop, wire protocol (shared with the Worker)
  app/        controller: content + event log → derived state
  main.tsx    app entry
worker/       Cloudflare Worker: /api handlers, D1 schema, its own tsconfig and generated types
migrations/   D1 schema SQL (reference; the Worker creates tables itself)
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

Sections beyond 4, 3rd–5th declensions, 3rd/4th conjugations, other tenses, pronouns, sentence exercises, dark mode.

## DCC core vocabulary

`npx tsx scripts/import-dcc.ts` turns `content/source/dcc-core-latin.json` (the DCC Latin Core
Vocabulary, CC BY-SA 3.0 — see `content/DCC-LICENSE.md`) into `content/dcc.json`, for the paradigms
implemented so far. Currently 365 of 997 entries; the rest wait for 3rd–5th declensions, 3rd/4th
conjugations, pronouns and irregulars. The importer reports every entry it can't expand or classify.

Spelling note: DCC marks some "hidden" vowel quantities that Wheelock does not (e.g. DCC *māgnus*,
Wheelock *magnus*). Of the 54 words in both Wheelock ch. 1–4 and DCC, this is the only difference.
Rule: when a word is in both, the app shows Wheelock's spelling.
