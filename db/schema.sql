CREATE TABLE IF NOT EXISTS article_clicks (
  article_id TEXT PRIMARY KEY,
  clicks INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS article_clicks_rank
  ON article_clicks (clicks DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'article',
  category TEXT NOT NULL DEFAULT 'opportunity',
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
