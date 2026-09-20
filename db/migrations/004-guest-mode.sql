CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO site_settings (key, value) VALUES ('guest_limit_enabled', '1');
