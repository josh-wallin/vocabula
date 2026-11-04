/**
 * Familia Rōmāna placement table, kept apart from src/data/fr.ts (the importer) so the path
 * builder can use it without pulling the importer into the app bundle. No FR text here.
 */

/**
 * Where each FR chapter's preview goes: the Wheelock section it follows, by the owner's study plan
 * (FR I–IV ↔ sections 1–4, V–VII ↔ 5–8, VIII–IX ↔ 9–11, X–XI ↔ 12–14, XII–XIII ↔ 15–16,
 * XIV–XV ↔ 17–18). Each FR chapter comes after one section of its block, in order. Section N
 * covers Wheelock chapter N (src/engine/curriculum.ts), so the section number is also the last
 * Wheelock chapter taught before the preview. A chapter not in the table is not imported.
 * Changing an entry for I–VII would move existing nodes (and their ids): don't.
 */
export const FR_PLACEMENT: Readonly<Record<number, number>> = {
  1: 1, 2: 2, 3: 3, 4: 4,
  5: 5, 6: 6, 7: 7,
  8: 9, 9: 10,
  10: 12, 11: 13,
  12: 15, 13: 16,
  14: 17, 15: 18,
};

/** The Wheelock section an FR chapter's preview follows, or null when the plan doesn't place it. */
export const frSection = (chapter: number): number | null => FR_PLACEMENT[chapter] ?? null;
