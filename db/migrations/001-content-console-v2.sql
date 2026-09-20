-- 对已有 D1 执行一次。执行前导出备份；此文件不自动运行。
ALTER TABLE articles ADD COLUMN extraction_state TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE articles ADD COLUMN extraction_note TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN original_body TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN media_manifest TEXT NOT NULL DEFAULT '[]';
ALTER TABLE articles ADD COLUMN rights_confirmed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
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
-- 保留迁移前文章作为第 1 版，旧记录本身不改动。
INSERT OR IGNORE INTO article_versions (article_id, revision, snapshot)
SELECT id, 1, json_object(
  'id',id,'source_url',source_url,'source_name',source_name,'author',author,
  'published_at',published_at,'format',format,'category',category,'rights',rights,
  'status',status,'title',title,'card_title',card_title,'summary',summary,
  'cover_url',cover_url,'body',body,'video_url',video_url,
  'extraction_state',extraction_state,'extraction_note',extraction_note,
  'original_body',original_body,'media_manifest',media_manifest,
  'rights_confirmed',rights_confirmed,'revision',revision
) FROM articles;
