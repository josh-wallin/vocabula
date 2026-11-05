-- Reported Gemini clips (the owner's "bad audio" flags), written by the vocabula-content
-- audio-gemini workflow (revert_flagged / redo_flagged) and read by GET /api/audio-index.
-- state 'blocked': the client plays the eSpeak clip instead (nothing deleted);
-- state 'redone': regenerated, `version` bumped so clients fetch the new take (?v=<version>).
-- handled_ts: the newest flag (event ts, ms) already acted on. The Worker also creates this
-- lazily (worker/schema.ts). Keep it identical to worker/schema.ts (tests/worker.test.ts checks).

CREATE TABLE IF NOT EXISTS audio_flags (
  key TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  handled_ts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
