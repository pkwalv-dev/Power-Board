-- Power Board D1 schema. Apply with:  npm run db:init:remote   (or db:init:local for wrangler dev)
-- Times in `expires` / `served` columns are milliseconds since 1970 (UTC). A row whose expires has passed
-- counts as gone; a cleanup on about 1% of requests deletes those rows.

-- Course (M1 / M8) and current quarter (1-4). Missing rows mean M1 / 1.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- One row per student. id = idOf_(cls, name) from Code.gs.
CREATE TABLE roster (
  id   TEXT PRIMARY KEY,
  cls  TEXT NOT NULL,
  name TEXT NOT NULL,
  pin  TEXT NOT NULL
);
CREATE INDEX roster_cls_name ON roster(cls, name);

-- data = JSON of clean_() output. version is bumped on every write (compare-and-swap).
-- Rows for students no longer on the roster are kept but ignored.
CREATE TABLE progress (
  id      TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated TEXT
);

-- Sign-ins. hash = SHA-256 of the token (the token itself is never stored). kind: s = student, t = teacher.
CREATE TABLE sessions (
  hash    TEXT PRIMARY KEY,
  kind    TEXT NOT NULL CHECK (kind IN ('s', 't')),
  sid     TEXT,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_sid ON sessions(sid);
CREATE INDEX sessions_expires ON sessions(expires);

-- Open and submitted quizzes. ans / n / exp / picks are JSON arrays. The answers never leave the server
-- until the quiz is submitted.
CREATE TABLE quizzes (
  qid     TEXT PRIMARY KEY,
  sid     TEXT NOT NULL,
  std     TEXT NOT NULL,
  ans     TEXT NOT NULL,
  n       TEXT NOT NULL,
  exp     TEXT NOT NULL,
  served  INTEGER NOT NULL,
  done    INTEGER NOT NULL DEFAULT 0,
  picks   TEXT,
  away_n  INTEGER NOT NULL DEFAULT 0,
  away_ms INTEGER NOT NULL DEFAULT 0,
  expires INTEGER NOT NULL
);
CREATE INDEX quizzes_expires ON quizzes(expires);

-- Wrong-guess counters (lf: student, ld: student per day, lv: device, tf: teacher) and
-- quiz rate limits (qg: gap between starts, qd: starts per day).
CREATE TABLE counters (
  key     TEXT PRIMARY KEY,
  n       INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX counters_expires ON counters(expires);
CREATE INDEX counters_kind ON counters(substr(key, 1, 3));   -- clearLocks

-- Quizzes where the student left the page (the old Flags tab). served / decided are ISO times.
-- status: open, deciding (being decided right now), dismissed, or "took N boxes".
CREATE TABLE flags (
  qid     TEXT PRIMARY KEY,
  served  TEXT,
  sid     TEXT,
  name    TEXT,
  cls     TEXT,
  std     TEXT,
  code    TEXT,
  n       INTEGER,
  sec     INTEGER,
  score   INTEGER NULL,
  status  TEXT,
  decided TEXT
);
CREATE INDEX flags_status ON flags(status);
CREATE INDEX flags_served ON flags(served);
