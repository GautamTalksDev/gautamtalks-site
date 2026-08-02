CREATE TABLE IF NOT EXISTS subscribers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL,
  email_hash   TEXT NOT NULL UNIQUE,
  profile      TEXT,
  consent_at   TEXT NOT NULL,
  token        TEXT,
  unsub_token  TEXT NOT NULL,
  confirmed    INTEGER NOT NULL DEFAULT 0,
  confirmed_at TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conf ON subscribers(confirmed);
CREATE INDEX IF NOT EXISTS idx_token ON subscribers(token);
CREATE INDEX IF NOT EXISTS idx_unsub ON subscribers(unsub_token);
