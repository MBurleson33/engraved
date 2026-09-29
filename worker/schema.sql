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

-- Comments (added later). Safe to run again.
CREATE TABLE IF NOT EXISTS comments (
  cid    INTEGER PRIMARY KEY AUTOINCREMENT,
  id     TEXT NOT NULL,
  name   TEXT,
  body   TEXT NOT NULL,
  ts     INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  iph    TEXT
);
CREATE INDEX IF NOT EXISTS comments_id ON comments(id, status);
CREATE INDEX IF NOT EXISTS comments_iph ON comments(iph, ts);
