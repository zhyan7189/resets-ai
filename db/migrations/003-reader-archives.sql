CREATE TABLE IF NOT EXISTS archive_ids (
  number INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL UNIQUE
);

INSERT INTO archive_ids (article_id)
SELECT a.id FROM articles a WHERE NOT EXISTS (SELECT 1 FROM archive_ids ai WHERE ai.article_id=a.id)
ORDER BY a.created_at, a.rowid;

CREATE TRIGGER IF NOT EXISTS article_archive_id AFTER INSERT ON articles
BEGIN
  INSERT OR IGNORE INTO archive_ids (article_id) VALUES (NEW.id);
END;

CREATE TABLE IF NOT EXISTS reader_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reader_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES reader_users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS reader_sessions_user ON reader_sessions(user_id);

CREATE TABLE IF NOT EXISTS reader_attempts (
  attempt_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
