-- 执行前导出 D1 备份。本迁移可重复执行，类型批量转换只会发生一次。
CREATE TABLE IF NOT EXISTS article_clicks_hourly (
  article_id TEXT NOT NULL,
  hour TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (article_id, hour)
);

CREATE INDEX IF NOT EXISTS article_clicks_hourly_recent
  ON article_clicks_hourly (hour DESC, article_id);

INSERT OR IGNORE INTO site_settings (key, value)
VALUES ('archive_categories_v2_migrated', '0');

UPDATE articles
SET category = 'tutorial'
WHERE (SELECT value FROM site_settings WHERE key = 'archive_categories_v2_migrated') = '0';

UPDATE site_settings
SET value = '1'
WHERE key = 'archive_categories_v2_migrated';
