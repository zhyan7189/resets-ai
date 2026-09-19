CREATE TABLE IF NOT EXISTS article_clicks (
  article_id TEXT PRIMARY KEY,
  clicks INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS article_clicks_rank
  ON article_clicks (clicks DESC, updated_at DESC);
