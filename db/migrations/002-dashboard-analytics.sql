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
