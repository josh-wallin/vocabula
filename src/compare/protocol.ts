/**
 * Shared shapes for the voice test (#/compare) and worker/tts.ts.
 *
 *   GET  /api/tts/status        → TtsStatus (which engine keys are configured; nothing is generated)
 *   GET  /api/tts/cache         → { clips: TtsClipInfo[] } (what's already generated; no audio)
 *   POST /api/tts               ← TtsRequest  → audio bytes (generated once, then from the D1 cache)
 *   GET  /api/tts/audio/:key    → cached audio bytes, or 404 (never generates)
 *   POST /api/tts/rating        ← TtsRating   → { ok: true }
 *   GET  /api/tts/ratings       → { ratings: TtsRatingRow[] }
 */
export const TTS_API = {
  base: '/api/tts',
  status: '/api/tts/status',
  cache: '/api/tts/cache',
  audio: '/api/tts/audio/',
  rating: '/api/tts/rating',
  ratings: '/api/tts/ratings',
} as const;

export type TtsEngine = 'openai' | 'gemini';
/**
 * `pseudo`: text respelled by toPseudo() + instructions; `plain`: macronized Latin + instructions;
 * `aspirated` (Gemini only): plain with ph/th/ch respelled pʰ/tʰ/kʰ (src/audio/gemini.ts).
 */
export type TtsVariant = 'pseudo' | 'plain' | 'aspirated';

/** The columns on the compare page. eSpeak clips come from the other audio pipeline (/api/audio/:key). */
export const COLUMNS = [
  { id: 'espeak', engine: 'espeak', variant: 'default', label: 'eSpeak NG' },
  { id: 'openai:pseudo', engine: 'openai', variant: 'pseudo', label: 'OpenAI · respelled' },
  { id: 'openai:plain', engine: 'openai', variant: 'plain', label: 'OpenAI · plain' },
  { id: 'gemini:plain', engine: 'gemini', variant: 'plain', label: 'Gemini · plain' },
  { id: 'gemini:aspirated', engine: 'gemini', variant: 'aspirated', label: 'Gemini · pʰ tʰ kʰ' },
] as const;
export type ColumnId = (typeof COLUMNS)[number]['id'];
export type Column = (typeof COLUMNS)[number];
export const column = (id: ColumnId): Column => COLUMNS.find((c) => c.id === id)!;
export const RATED_ENGINES = new Set<string>(COLUMNS.map((c) => c.engine));
export const RATED_VARIANTS = new Set<string>(COLUMNS.map((c) => c.variant));

/** `ph`: ph / th / ch read as English f / θ / ch (added with the spot-check). */
export const PROBLEMS = ['c', 'v', 'ae', 'ph', 'length', 'stress', 'other'] as const;
export type Problem = (typeof PROBLEMS)[number];

export interface TtsRequest { engine: TtsEngine; variant: TtsVariant; text: string }
export const MAX_TTS_TEXT = 400;

export interface TtsStatus { openai: boolean; gemini: boolean }

export interface TtsClipInfo { key: string; engine: string; variant: string; text: string; mime: string; created_at: string }

export interface TtsRating {
  item: string;
  engine: string;
  variant: string;
  /** 1–5, or null when only problems / a note are recorded. */
  score: number | null;
  problems: Problem[];
  note: string;
}
export interface TtsRatingRow extends TtsRating { updated_at: string }

/** Where the owner adds a missing key; shown with a 503. */
export const SECRET_HELP = 'Add the key in Cloudflare → Workers → vocabula → Settings → Variables and Secrets.';

/* ---------------- summary ---------------- */

export interface ColumnSummary { id: string; label: string; rated: number; average: number | null; problems: [Problem, number][] }

/**
 * Average score and most-reported problems per column (problems sorted by count, then PROBLEMS order).
 * `items`: only ratings of these items (one section of the page); `columns`: which columns to report.
 */
export function summarize(ratings: readonly TtsRating[], opts: { items?: readonly string[]; columns?: readonly Column[] } = {}): ColumnSummary[] {
  const only = opts.items ? new Set(opts.items) : null;
  return (opts.columns ?? COLUMNS).map((c) => {
    const rs = ratings.filter((r) => r.engine === c.engine && r.variant === c.variant && (!only || only.has(r.item)));
    const scored = rs.filter((r) => typeof r.score === 'number') as (TtsRating & { score: number })[];
    const counts = new Map<Problem, number>();
    for (const r of rs) for (const p of r.problems) counts.set(p, (counts.get(p) ?? 0) + 1);
    const problems = [...counts].sort((a, b) => b[1] - a[1] || PROBLEMS.indexOf(a[0]) - PROBLEMS.indexOf(b[0]));
    return {
      id: c.id, label: c.label, rated: scored.length,
      average: scored.length ? Math.round((scored.reduce((n, r) => n + r.score, 0) / scored.length) * 100) / 100 : null,
      problems,
    };
  });
}
