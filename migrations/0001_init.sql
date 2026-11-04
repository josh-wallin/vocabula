-- Vocābula sync schema. The Worker also creates these lazily (worker/schema.ts),
-- so applying this file is optional:  npx wrangler d1 migrations apply vocabula --remote
-- Keep it identical to worker/schema.ts (tests/worker.test.ts checks).

CREATE TABLE IF NOT EXISTS packs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body TEXT NOT NULL,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  device TEXT NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  card TEXT,
  grade TEXT,
  body TEXT,
  received_at TEXT NOT NULL
);
