CREATE TABLE IF NOT EXISTS article_clicks (
  article_id TEXT PRIMARY KEY,
  clicks INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS article_clicks_rank
  ON article_clicks (clicks DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS article_clicks_hourly (
  article_id TEXT NOT NULL,
  hour TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (article_id, hour)
);

CREATE INDEX IF NOT EXISTS article_clicks_hourly_recent
  ON article_clicks_hourly (hour DESC, article_id);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'article',
  category TEXT NOT NULL DEFAULT 'tutorial',
  rights TEXT NOT NULL DEFAULT 'summary',
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL DEFAULT '',
  card_title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  extraction_state TEXT NOT NULL DEFAULT 'manual',
  extraction_note TEXT NOT NULL DEFAULT '',
  original_body TEXT NOT NULL DEFAULT '',
  media_manifest TEXT NOT NULL DEFAULT '[]',
  rights_confirmed INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS articles_publication
  ON articles (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS article_versions (
  article_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (article_id, revision)
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  adapter TEXT NOT NULL,
  state TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS import_jobs_recent ON import_jobs (created_at DESC);

CREATE TABLE IF NOT EXISTS ad_slots (
  slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 4),
  label TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '✦',
  target_url TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL DEFAULT '',
  ends_at TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_visits_daily (
  day TEXT PRIMARY KEY,
  pageviews INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS article_metrics_daily (
  article_id TEXT NOT NULL,
  day TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (article_id, day)
);

CREATE INDEX IF NOT EXISTS article_metrics_recent ON article_metrics_daily (day DESC, article_id);

CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  action TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS review_events_article ON review_events (article_id, created_at DESC);

CREATE TABLE IF NOT EXISTS archive_ids (
  number INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL UNIQUE
);

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
