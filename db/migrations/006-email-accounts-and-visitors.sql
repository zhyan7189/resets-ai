ALTER TABLE reader_users ADD COLUMN email TEXT COLLATE NOCASE;
CREATE UNIQUE INDEX reader_users_email ON reader_users(email COLLATE NOCASE) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS site_visitors (
  visitor_hash TEXT PRIMARY KEY,
  first_seen_day TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pageviews INTEGER NOT NULL DEFAULT 1,
  reader_user_id TEXT REFERENCES reader_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS site_visitors_first_seen ON site_visitors(first_seen_day DESC);

CREATE TABLE IF NOT EXISTS site_visitor_days (
  visitor_hash TEXT NOT NULL REFERENCES site_visitors(visitor_hash),
  day TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (visitor_hash, day)
);

CREATE INDEX IF NOT EXISTS site_visitor_days_recent ON site_visitor_days(day DESC);

CREATE TABLE IF NOT EXISTS reader_visits_daily (
  user_id TEXT NOT NULL REFERENCES reader_users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS reader_visits_recent ON reader_visits_daily(day DESC, user_id);
