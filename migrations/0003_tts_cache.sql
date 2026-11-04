-- Voice test (#/compare): generated TTS clips and the owner's ratings.
-- The Worker also creates these lazily (TTS_SCHEMA in worker/tts.ts), so applying this
-- file is optional. Keep it identical to TTS_SCHEMA (tests/tts.test.ts checks).
-- (0002 is reserved for the audio branch's `audio` table.)

CREATE TABLE IF NOT EXISTS tts_cache (
  key TEXT PRIMARY KEY,
  engine TEXT NOT NULL,
  variant TEXT NOT NULL,
  text TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tts_ratings (
  item TEXT NOT NULL,
  engine TEXT NOT NULL,
  variant TEXT NOT NULL,
  score INTEGER,
  problems TEXT NOT NULL,
  note TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (item, engine, variant)
);
