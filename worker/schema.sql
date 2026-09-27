-- Engraved save tracking. Paste this into the D1 database console once.
CREATE TABLE IF NOT EXISTS counts (
  id TEXT PRIMARY KEY,
  n  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS saves (
  id      TEXT NOT NULL,
  city    TEXT,
  region  TEXT,
  country TEXT,
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS saves_ts ON saves(ts);
