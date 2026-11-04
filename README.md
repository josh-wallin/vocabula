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
- **Events** (`src/engine/events.ts`, `src/data/db.ts`): IndexedDB (idb) append-only log `{id, device, ts, kind: 'review'|'node_done'|'setting'|'flag', card?, grade?, body?, outbox}`. Every derived value (FSRS cards, progress, streak, puncta) is a replay sorted by `(ts, id)`, so the same events in any order give the same state. `outbox: 1` marks events not yet accepted by the sync server.
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

### Familia Rōmāna previews

"Meaning-only until their grammar is unlocked." If `content/private/source/fr_ch1-7.json` (your own list from *Familia Rōmāna*, ch. 1–7) exists, `npm run build:pack` adds an optional `fr` array to the pack (`counts.fr` per FR chapter; pack id gains `+fr-cap1-7`). Packs without `fr` validate and build exactly the old path; `parsePack` (shared with the Worker) checks the field when present.

- **Import** (`src/data/fr.ts`, pure): proper names (characters and places) are dropped, and so is any word a Wheelock chapter at or before the FR chapter teaches. A word Wheelock teaches **later** stays, under the Wheelock lemma's id (via `wheelockHeadword`), so its FSRS cards are shared. Abbreviated headwords (`capitulum, -ī, n.`) are spelled out with the DCC expander; case notes (`cum + abl.`) and alternatives (`ā / ab` → `ā (or ab)`) are tidied. Pronouns, numerals and irregular verbs with no paradigm yet get a provisional id (`hic-fr-pron`) that can't collide with an indeclinable (`hic-indecl`). Only headword, forms and gloss travel: no FR notes.
- **Lexicon**: an FR entry joins the existing Word when it is the same word (id, else spelling + paradigm, else DCC rank with the same POS); Wheelock's or DCC's spelling and gloss win, as for *magnus*. Other entries become `origin: 'fr'` words.
- **Path**: after section N (N = 1–7, only if the path has that section), before any Probātiō: "Familia Rōmāna · Cap. N" nodes (`sN.fr.K`, "· Pars II" when split), ≤6 words each, a Repetītiō after every 3. Words the main path (Verba or Plūra verba) teaches at or before section N are left out; those it teaches later, or never (e.g. 4th-conjugation DCC words), are previewed.
- **Exercises**: new-word card, Latin→English, and English→Latin recall after 2 correct meaning reviews (first citation form). FR-only words never get class or forms exercises. A previewed Wheelock/DCC word gets them only once the main path has taught it, or earlier if every feature its paradigm needs is already unlocked.
- **UI**: Words tab tags preview words "FR"; About & credits says they come from your own copy.

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
| `GET /api/audio/:key` | A pronunciation clip (`audio/mpeg`) from D1 table `audio`, `Cache-Control: private, max-age=31536000, immutable`, `ETag: "<key>"` (`If-None-Match` → `304` without a database read). Unknown key → `404 {"error":"no audio"}`. Handler: `worker/audio.ts`. |

Events on the wire are exactly the client's `VEvent` (`{id, device, ts (ms, integer), kind, card?, grade? ('good'|'again'), body?}`), without the device-local `outbox` flag. Table `events(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, device, ts INTEGER, kind, card, grade TEXT, body TEXT (JSON), received_at)`. `seq` increases but may skip values (ignored duplicates can consume AUTOINCREMENT numbers); clients only rely on order.

### Client

- **Pack**: on start (once content is loaded, never blocking it) the app calls `GET /api/pack` with `If-None-Match` of the stored pack's hash. A different pack is validated and stored, unless the device's pack has a newer `builtAt` (e.g. imported but not yet uploaded); progress is untouched either way. Profile → **Cloud** shows the server pack (present/absent, words, updated, same as this device or not) and **Upload this device's pack to the cloud** (`PUT /api/pack`).
- **Sync loop** (`src/sync/sync.ts`): runs on start, on `online`, when the page becomes visible, after a lesson ends or is quit, from Profile → Sync now, and every 5 minutes while visible. It POSTs the outbox in chunks of 500 (oldest first) and clears `outbox` only for chunks that got a 2xx, then GETs `/api/events?after=<cursor>` until `more` is false, appends events whose id it doesn't have, and stores the cursor (IndexedDB `meta.syncCursor`). If anything new arrived, the app re-reads the log and replays (deferred until the current lesson ends). Failures back off exponentially (15 s doubling, max 15 min); nothing is thrown to the UI.
- **Status chip** (top bar): `Offline` / `Syncing…` / `Synced` / `N queued` (`Not synced` after an error with nothing queued), or a `Sign in` button when the session has expired.
- **Expired session**: Access protects static assets too, but the service worker serves the app shell from cache, so an expired session first shows up on `/api` calls. Those use `fetch(…, {redirect: 'manual'})`; Access's redirect to its login page then arrives as an `opaqueredirect` response. That, any 3xx, 401/403, or a 2xx that isn't JSON counts as "session expired". **Sign in again** does a full navigation to `/api/me?return=/`: Access sends the browser through login and back, and the Worker redirects to `/`.
- **Service worker**: `navigateFallbackDenylist` has `/^\/api\//` and `/^\/cdn-cgi\//` (Access's `/cdn-cgi/access/authorized` and `/logout` live on the app origin), and both prefixes are `NetworkOnly` (never precached or cached), except pronunciation clips (`/api/audio/*`, CacheFirst, see Listening).

### How state converges

Every device keeps the same append-only log of events with globally unique ids. The server stores each id once; each device eventually holds every event (its own plus everything after its cursor). All derived state (FSRS cards, progress, streak, puncta, settings) is `replay(events)`, which sorts by `(ts, id)` and de-duplicates by id, so two devices with the same set of events compute identical state, whatever order the events arrived in. A setting changed on two devices resolves to the later `ts` (ties by id). Tests: `tests/sync.test.ts` (devices exchanging events in different orders through the real handlers), `e2e/sync.e2e.ts` (two browsers).

### One-time setup

1. **Access**: Workers & Pages → vocabula → Access: enable it for all traffic with a policy allowing only your email. Copy the application's AUD tag into `ACCESS_AUD` in `wrangler.jsonc` (already set for the current app). Without Access, `ctx.access` is absent and every `/api` call is 403.
2. **Allowed email**: `ALLOWED_EMAILS` in `wrangler.jsonc` `vars` (comma-separated). Changing it is a commit + deploy.
3. **D1**: database `vocabula` is bound as `DB`; tables are created on the first API call. Optionally `npx wrangler d1 migrations apply vocabula --remote`.
4. **Pack**: on a device that has the file, import it, then Profile → **Upload this device's pack to the cloud**. Other devices then use **Sign in & download**.

Local full stack: `npm run build && npm run dev:worker` (`wrangler dev` serves `dist/` plus the API with local D1; the `access.dev` block in `wrangler.jsonc` simulates the Access identity).

## Sentence exercises

Original Latin sentences (written for this app, never copied from Wheelock), public and bundled: `content/sentences/sNN.json`, one file per section (s01–s08 so far, 16–20 sentences each). `src/content/sentenceBank.ts` globs the folder, so a new section is a new file.

### Schema

```jsonc
{
  "id": "s03-08",                 // sNN-MM: section, position in the file
  "section": 3,                   // first section the sentence may appear in
  "tokens": [
    { "form": "fīlius", "lemma": "filius-n2m", "cell": "nom.sg", "role": "subj" },
    { "form": "agricolae", "lemma": "agricola-n1", "cell": "gen.sg" },
    { "form": "in", "lemma": "in-indecl", "cell": "citation", "phrase": 1 },
    { "form": "agrō", "lemma": "ager-n2m", "cell": "abl.sg" },
    { "form": "est", "lemma": "sum-irr-sum", "cell": "pres.act.ind.3sg", "role": "verb" }
  ],
  "en": ["The farmer's son is in the field.", "The son of the farmer is in the field."],
  "punct": ".",                   // optional: "." (default), "?" or "!"
  "order": ["free", 0, 1, ["first", 2, 3], 4]   // optional, see below
}
```

- `form` is exactly what the morph engine generates for `lemma` + `cell` (macrons; capitals only for names and *Ō*). Lemma ids are the lexicon's (`lemmaId`). Indeclinables use cell `citation`.
- `role`: `subj`, `obj`, `iobj`, `verb`, `pred` (predicate nominative), `voc`. Every finite verb (and imperative) is `verb`; implied subjects simply have no `subj` token.
- `attach: "que" | "ne"`: the enclitic is written onto this word (*puellae* + `que` → *puellaeque*).
- `phrase: n`: this word heads a unit with the next n tokens (a preposition and its object phrase; *Ō* + a vocative).
- `comma: true`: a comma follows the word in the printed sentence.
- `en`: accepted translations. `{a|b}` = alternatives, `[x]` = optional words. The **first** entry, with the first alternative and every optional word, is what the learner sees (and the English tiles); every expansion of every entry is accepted.

### Word order (English → Latin tiles)

Latin word order is free, within units. `order` is a tree: a token index, or `[kind, ...children]` with kind `free` (any order), `fixed` (as written), `first` (first child first, rest free) or `coord` (`[A, conj, B]` or `[B, conj, A]`). Without `order`, it is derived: everything free, except a `phrase` unit (head first, its words in any order), *nōn* + the next word or unit (fixed), a `-que` word right after the word before it, and a `-ne` word first. Sentences with a clause word (*et, sed, sī, dum, igitur, tamen, ubi, quandō, quārē*) or two finite verbs must give `order` (a test checks). An answer is right when its tiles, in order, are one of the tree's orders (`latinOrders`, ≤ 7 words, so they are simply enumerated). The written order must itself be allowed (a test checks).

### English answers (Latin → English tiles)

`normalizeEnglish`: case, punctuation, curly quotes and spacing are ignored; common contractions are expanded (*don't* = *do not*, *can't* = *cannot* = *can not*, *won't*, *I'm*, *you're*, …). *will* = *shall*, *O* = *Oh*, and British *-our* spellings = American *-or* (*labour*, *favourable*, *honour*, *valour*, *colour*), both ways. **Articles**: Latin has none, so *a*, *an* and *the* are interchangeable (*a rose* = *the rose*), but whether an article is there still counts (*the girl loves roses* ≠ *girl loves roses*); where English can go either way, the bank lists both (`[the]`). Distractor tiles never occur in any accepted answer, not even as an equivalent (no *shall* tile when *will* is accepted); they come from other sentences' English (sections reached), then from known words' glosses, then a few common words.

### Eligibility

A sentence appears only when its section is reached, every lemma (and enclitic) is known to the learner (`path.knownAt` + seen), and every token's ending feature is unlocked (`featureOfCell` / `hasFeature`). `tests/sentence-bank.test.ts` checks the bank against the private Wheelock list (skipped without it): each lemma is a Wheelock word first taught at or before the sentence's section (DCC-only words are impossible: they aren't on the list), `generate(lemma)[cell] === form`, the cell's feature is unlocked by `featuresAt(section, true)`, each sentence is eligible at the end of its section on the real path with ≥ 3 exercise types, and each uses something its section introduces. Shape checks (ids, 2–7 words, roles vs cases, subject–verb agreement, order trees, English markup) always run. `content/private/coverage/sentences_s01-s08.txt` lists every sentence as `Latin = English` for an independent back-translation check, with the `{a|b}` / `[x]` notation so a checker sees exactly what is accepted.

### Exercise types (`src/engine/sentences.ts`, UI `src/ui/SentenceView.tsx`)

| Card | Exercise |
|---|---|
| `sent:<id>:cloze` | One word blanked; pick from 4 distinct forms of its lemma, from unlocked cells only, nearest cells first (same number / tense). The other "you" (2nd sg. ↔ 2nd pl.) is never a distractor, since the English can't tell them apart. English shown as a hint. |
| `sent:<id>:en` | Build the English from tiles: the shown translation's words + 2–3 distractors. Any accepted translation passes. |
| `sent:<id>:subj` / `:obj` | Tap the subject (or direct object) word(s); "No written subject" when the verb's ending carries it. Only single-verb sentences; `obj` only when there is a written object. Several subjects → select all. |
| `sent:<id>:la` | Build the Latin from tiles: the sentence's forms + 1–2 wrong forms of the same lemmas (unlocked cells, never one of the sentence's forms). Any allowed word order passes; feedback shows the written order. |

### Lessons and scheduling

Repetītiō (13) has 2–4 sentence exercises (2 with 1–2 eligible sentences, 3 with 3–7, 4 with 8+), Fōrmae 2–3 (sentences using the section's new endings first, and the cloze blanks such a word when it can), Probātiō 6 of its 20; Verba, pattern, Plūra verba and FR lessons have none. Lesson lengths are unchanged: sentences replace word exercises. Each sentence exercise is an FSRS card graded by the ordinary `review` event (`card: "sent:s03-08:la"`), so the Worker needs nothing new; `parseCardId` ignores these ids, so they never touch word cards, "seen" words or "Words practised". Choice: due cards first (lowest retrievability), then never-practised ones (current section first), then the rest; one exercise per sentence, types spread out. Sentence choice uses its own seeded RNG stream, so lessons without eligible sentences are exactly as before.

### Flags

Every exercise screen (words and sentences, intro and grammar cards too) has a flag button: reason (*wrong answer* / *bad Latin* / *bad English* / *other*) + optional note. It records a `flag` event, body `{ref, reason, note?, shown?, node?}`: `ref` is the card id (`amo-v1:meaning`, `sent:s02-01:la`) or `lemma:<id>` / `grammar:<section>`; `shown` is what the screen showed (prompt, cue, options; ≤ 500 chars). The shared `parseEvent` validates it (reason from the list, ref ≤ 256, note ≤ 1000), so the Worker, sync and backups accept it like any event. `replay` collects `state.flags`; Profile → Flags lists them, newest first. An older client that pulls a `flag` event skips it (sync drops records its validator rejects).

## Listening (Audī)

Pronunciation clips come from **eSpeak NG**'s Latin voice (`la`, restored classical pronunciation), pre-generated at 130 words per minute (slower than eSpeak's 175, for learners) and stored in D1. Nothing is synthesized on the device or in the Worker.

- **Keys** (`src/audio/key.ts`): `key = sha256("espeak-ng+p1|la|130|" + normalize(text))`, first 24 hex digits; normalize = NFC, lowercase, single spaces, trimmed, punctuation kept. Pure synchronous SHA-256, so lessons (built synchronously) can compute keys. Test vector, also asserted in the content repo: `Amō` → `fb92e07d84a2cd968a353adf`. `p1` is the version of the pre-processing below: bump it (here and in vocabula-content `scripts/audio-lib.mts`) whenever the pre-processing or the voice changes, so every clip is regenerated under new keys.
- **Pre-processing** (`src/audio/speech.ts`), applied to the text eSpeak is given (the key covers it through the version tag): consonantal *i* → *j* at the start of a word before a vowel (*iam* → *jam*; eSpeak reads *iam* as two syllables) and after a prefix (*adiuvō, coniungō, iniūria, obiectus*; *obiciō* → *objiciō*), vocalic forms of *eō* left alone; *eu* → *eü* except in real diphthongs (*heu, seu, ceu, neu, neuter*, Greek *Eu-*), because eSpeak makes every *eu* a diphthong (*deus* as one syllable); enclitic hyphens dropped. Intervocalic *i* (*cuius, huius, maior, eius*) eSpeak already doubles (/kʊjjʊs/).
- **What eSpeak gets right** (checked with `espeak-ng -v la -x`): *c* = /k/, *v* = /w/, *ae* = /ai/, *oe* = /oi/, *gn* = /ŋn/, *qu* = /kw/, *ph th* aspirated, macrons → long vowels, penult-law stress (*agricola* /aɡˈrɪkɔla/, *amāre* /amˈaːrɛ/). **Known gaps**: final *-m* is not nasalized; no elision; *deinde* is stressed de-ín-de; *coniungō* gets initial stress; *cui*, *huic* are two syllables; isolated words sometimes carry only secondary stress (*eius*, *mihi*).
- **Manifest** (`src/audio/items.ts`, `scripts/audio-manifest.ts`): each lemma's first citation form (*amō*), its full citation when it has more than one form (*rosa, rosae*; *amō, amāre*; *magnus, magna, magnum*), every bank sentence as printed, every written word in the bank, and the voice-test items (`src/compare/items.ts`). Currently 2045 clips. The output holds Wheelock words: never commit it.
- **Pipeline**: the private content repo's Action (`vocabula-content/.github/workflows/audio.yml`) builds the manifest from this repo's code, synthesizes only the keys D1 doesn't have (`espeak-ng -v la -s 130` → ffmpeg → MP3), and uploads them with `wrangler d1 execute --file` (`INSERT OR REPLACE … X'…'`, each statement < 90 KB). It runs on pushes that change the pack or scripts, or by hand (inputs `app_ref`, `force`). Table: `audio (key TEXT PRIMARY KEY, mime, bytes BLOB, text, engine, created_at)` (`worker/schema.ts`, `migrations/0002_audio.sql`).
- **Format**: MP3, mono, 22.05 kHz, 32 kbps CBR, leading silence trimmed (≈ 4 KB per word, 8 KB on average, 22 KB max; 15.9 MB for all 2045). MP3 plays on iOS Safari and Android Chrome alike; Opus would be smaller, but Safari's support depends on the iOS version and the container.
- **Client** (`src/audio/player.ts`): clips are fetched (`redirect: 'manual'`, so an expired sign-in is a failure, not a login page) and played from blob URLs through one shared `<audio>` element (no Range requests, which Safari wants for media URLs). The first tap in a lesson unlocks the element on iOS so later clips can autoplay. A 404 marks the key missing for the session. The service worker caches `/api/audio/*` **CacheFirst** (cache `audio`, 5000 entries, only `200 audio/mpeg`), a rule placed before the `NetworkOnly` `/api` rule (`pwa-runtime.ts`). A lesson prefetches its clips when it starts.
- **Speakers**: on new-word cards (the citation; autoplays), beside Latin cues that don't give the answer away (Latin → English, gender / conjugation, parse, subject / object), and in every feedback panel (the word, form or sentence). Hidden when the clip can't play (offline and not cached, or missing).
- **Exercises** (Latin label *Audī*), only when the setting is on and the clip is likely playable (online, or cached on this device, and not known missing):

| Card | Exercise | Fallback when the clip fails |
|---|---|---|
| `{lemma}:listen` | Hear the word, choose its meaning (Latin → English distractors) | the meaning question |
| `{lemma}:dictate` | Hear the word, type it; macrons optional, spelling shown (only after a `:listen` review) | the meaning question |
| `sent:<id>:listen` | Hear the sentence, build the English from tiles (any accepted translation) | `sent:<id>:en` |
| `sent:<id>:dictate` | Hear the sentence, build it from Latin tiles in the heard order (only after a `:listen` review) | `sent:<id>:la` |

  A word gets listening once it has ≥ 1 correct meaning review. Verba / Plūra verba / FR lessons get 2 word-listening exercises on earlier words (part of the 12, or added when intros and quizzes already fill it); Repetītiō 2 word + 1 sentence listening, Probātiō 2 sentence listening, within their usual lengths; pattern and Fōrmae lessons none. Due listening cards come first, then new ones, then the weakest. If a clip can't be loaded when its exercise comes up, the fallback takes its place, ungraded for the listening card. These are ordinary `review` events: `parseEvent` accepts any card id, and `parseCardId` / `parseSentenceCard` ignore them, so they never touch word cards or the sentence chooser. Without `ctx.listening` (or with nothing available) every lesson is exactly as before.
- **Profile → Listening**: *Listening exercises* and *Autoplay audio* (both on by default; `setting` events, so they sync).

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

The e2e test (`e2e/smoke.e2e.ts`, playwright-core + system Chrome, `CHROME_PATH` to override) serves `dist/`, imports the private pack, plays the first Verba lesson through the DOM (missing one answer on purpose), checks the node stays done after reload, then goes offline, reloads, and plays the next lesson; then Verba II (flagging its first screen) and the first Repetītiō, answering its sentence exercises, and checks the flag is listed in Profile. It refuses to run if its port (4179, or `E2E_PORT`) is already serving something, and runs `vite preview` in its own process group so it is stopped afterwards.

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
  content/    glossary, grammar cards, sentence bank loader (original writing)
  sync/       client sync: fetch wrapper, sync loop, wire protocol (shared with the Worker)
  audio/      clip keys, eSpeak pre-processing, manifest items, browser player
  app/        controller: content + event log → derived state
  main.tsx    app entry
worker/       Cloudflare Worker: /api handlers, D1 schema, its own tsconfig and generated types
migrations/   D1 schema SQL (reference; the Worker creates tables itself; 0002 = audio)
content/      data files
  sentences/  sentence bank, one JSON file per section (original Latin, public)
  private/    copyrighted textbook data: gitignored, NEVER committed (a symlink to it is ignored too)
scripts/      CLI tools (import-wheelock.ts, import-dcc.ts, build-pack.ts, audio-manifest.ts)
e2e/          headless browser smoke test
tests/        Vitest specs
public/       icons and static assets
```

## Rule: `content/private/` is never committed

Everything under `content/private/` (the raw Wheelock and Familia Rōmāna lists, the generated `wheelock.json` and `vocabula-pack.json`) is copyrighted textbook material. It is listed in `.gitignore` and must never be committed, pushed or bundled into a public build. Before committing, check with `git status --ignored`. `tests/no-private-in-dist.test.ts` fails if any Wheelock-only or FR-only gloss appears in `dist/`. Do not force-add (`git add -f`) anything under it.

## Not yet built

Sections beyond 4, 3rd–5th declensions, 3rd/4th conjugations, other tenses, pronouns, sentences for sections 9–10, dark mode.

## DCC core vocabulary

`npx tsx scripts/import-dcc.ts` turns `content/source/dcc-core-latin.json` (the DCC Latin Core
Vocabulary, CC BY-SA 3.0 — see `content/DCC-LICENSE.md`) into `content/dcc.json`, for the paradigms
implemented so far. Currently 365 of 997 entries; the rest wait for 3rd–5th declensions, 3rd/4th
conjugations, pronouns and irregulars. The importer reports every entry it can't expand or classify.

Spelling note: DCC marks some "hidden" vowel quantities that Wheelock does not (e.g. DCC *māgnus*,
Wheelock *magnus*). Of the 54 words in both Wheelock ch. 1–4 and DCC, this is the only difference.
Rule: when a word is in both, the app shows Wheelock's spelling.
