# DCC Latin Core Vocabulary: source and validation

## Attribution and license

Dickinson College Commentaries, https://dcc.dickinson.edu
Latin Core Vocabulary, compiled 2012–13 by a team at Dickinson College led by Christopher Francese.
Frequency ranks derive from the LASLA list (Delatte, Evrard, Govaerts, Denooz, *Dictionnaire fréquentiel et index inverse de la langue latine*, Liège 1981).
License: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0), https://creativecommons.org/licenses/by-sa/3.0/
(the license is stated on https://dcc.dickinson.edu/vocab/core-vocabulary). Derivatives of this data must carry the same license.

## Source URLs

- Overview page: https://dcc.dickinson.edu/vocab/core-vocabulary
- List page (HTML): https://dcc.dickinson.edu/latin-core-list1
- DCC's own CSV export: https://dcc.dickinson.edu/latin-core-list.csv (also `?page&_format=csv`; an XML export exists at `/latin-core-list.xml?page&_format=xml`)

## How the file was obtained

dcc.dickinson.edu cannot be reached from this shell, so the CSV export was not downloaded directly. Instead:

- `dcc-latin-core-list.source.csv` is a byte-for-byte copy of
  `vocabulary/sources/dcc_latin_core_list.csv` in the public repo https://github.com/threedlite/classicsviewer
  (commit 225b47b23062ff5f88b7ab49435efd1a4f2b8099, 2026-10-21). That repo's README says the file is DCC's
  `latin-core-list.csv` export "exactly as downloaded" on 2026-09-26 and must not be edited.
  SHA-256: cce3fa7260379a622ef604323b96f1f5534b13761fd6c1e15f7939172fff873f
- Retrieved and validated: 2026-11-03.
- Cross-checked against other copies on GitHub:
  - semilin/shark-reader `core_lists/latin-core-list.csv`: identical except one row. There, rank 874 rīdeō is POS "Verb: 3rd Conjugation -ō". The live page and the threedlite copy both have "Verb: 2nd Conjugation".
  - sjhuskey/latin-vocabulary `dcc-latin-core-list.csv` (2021, older export): differs in a few ranks, macrons and POS values. These reflect DCC edits made since then, and the live page matches the threedlite copy.
  - jacknoutch/eclogues_commentary `docs/latin-core-list.xml`: a different (older) DCC rendering, with headwords spelled out in full (e.g. "abeō abīre abiī abitum"). Not used.

## Transformation

`dcc-core-latin.json` is an array of `{rank, headword, definition, pos, semantic_group}`, sorted by (rank, headword).
The source columns are Frequency Rank, Headword, Definition, Part of Speech and Semantic Group. Values are copied unchanged:
all fields were already NFC, with no leading or trailing whitespace, and no macrons were stripped or added. `rank` is an integer.

## Known quirks (present in DCC's own data and the live page; kept as is)

- 997 entries, ranks 1–997.
- Rank 280 appears twice (quisquam quicquam/quidquam; vērō), so rank 12 is missing. In the 2021 export, quisquam was rank 12. The live page today also skips 12, going straight from 11 to 13.
- Rank 985 `fore` has an empty definition, both on the live page and in the export.
- The POS "Verb: Deponent" does not give a conjugation. It has to be inferred from the principal parts. Some headwords use abbreviated principal parts (e.g. "-ēre", "-āre"); others are spelled out in full.

## Validation (2026-11-03)

41 rows were spot-checked against the live page https://dcc.dickinson.edu/latin-core-list1, sorted ascending and descending
by frequency rank, using WebFetch with verbatim-copy prompts. The checked ranks were 1–11, 13–15, 47, 98, 150, 203, 251, 280 (×2), 302, 355, 401,
449, 503, 550, 579, 604, 653, 700, 751, 802, 850, 874, 875, 901, 950, 985, 990 and 997.
Each check compared headword (letters and macrons), definition, POS, semantic group and rank.
**Result: 41/41 exact matches, 0 mismatches.** The live page also confirmed that rank 12 is absent and that rank 985 has an empty definition.
Caveat: WebFetch passes the page through a summarizing model. Without a strict verbatim prompt, it paraphrased definitions. The verbatim
responses matched the CSV character for character, which is strong but indirect evidence of fidelity.

## POS tally (997 entries)

| Count | Part of Speech |
|---:|---|
| 157 | Noun: 3rd Declension |
| 114 | Verb: 3rd Conjugation -ō |
| 109 | Adjective: 1st and 2nd Declension |
| 104 | Adverb |
| 95 | Noun: 2nd Declension |
| 62 | Noun: 1st Declension |
| 56 | Verb: 1st Conjugation |
| 45 | Verb: 2nd Conjugation |
| 37 | Adjective: 3rd Declension |
| 36 | Conjunction |
| 36 | Verb: Irregular |
| 26 | Verb: Deponent |
| 24 | Pronoun |
| 23 | Preposition |
| 21 | Verb: 3rd Conjugation -iō |
| 19 | Noun: 4th Declension |
| 13 | Verb: 4th Conjugation |
| 7 | Noun: 5th Declension |
| 6 | Adjective: Numeral |
| 4 | Verb: Impersonal |
| 2 | Noun: Indeclinable |
| 1 | Adjective: Indeclinable |

There are 38 distinct semantic groups.
