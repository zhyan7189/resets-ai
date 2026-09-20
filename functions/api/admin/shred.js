import { authorized, database, json } from "../../../lib/articles.js";

const keysIn = (value) => [...String(value || "").matchAll(/\/api\/media\/([a-f0-9-]{36}\.(?:jpg|png|webp|gif))/g)].map((match) => match[1]);

export async function onRequestPost({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  const missing = database(env);
  if (missing) return missing;
  let input;
  try { input = await request.json(); } catch { return json({ error:"invalid_json" }, 400); }
  const id = String(input?.id || "");
  if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ error:"invalid_id" }, 400);
  try {
    const article = await env.DB.prepare("SELECT a.*, 'DA' || ai.number AS archive_code FROM articles a JOIN archive_ids ai ON ai.article_id=a.id WHERE a.id=?").bind(id).first();
    if (!article) return json({ error:"not_found" }, 404);
    if (article.status !== "discarded") return json({ error:"not_discarded" }, 409);
    if (article.archive_code !== input.archive_code || Number(input.revision) !== article.revision) return json({ error:"revision_conflict" }, 409);
    const versions = await env.DB.prepare("SELECT snapshot FROM article_versions WHERE article_id=?").bind(id).all();
    const keys = [...new Set(keysIn([article.body, article.cover_url, article.media_manifest, ...(versions.results || []).map((row) => row.snapshot)].join(" ")))];
    if (keys.length && !env.MEDIA) return json({ error:"media_unconfigured" }, 503);
    const exclusive = [];
    for (const key of keys) {
      const path = `/api/media/${key}`;
      const used = await env.DB.prepare(`SELECT 1 AS used FROM articles WHERE id!=? AND (body LIKE ? OR cover_url LIKE ? OR media_manifest LIKE ?)
        UNION SELECT 1 AS used FROM article_versions WHERE article_id!=? AND snapshot LIKE ? LIMIT 1`).bind(id, `%${path}%`, `%${path}%`, `%${path}%`, id, `%${path}%`).first();
      if (!used) exclusive.push(key);
    }
    const absent = "NOT EXISTS (SELECT 1 FROM articles WHERE id=?)";
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM articles WHERE id=? AND status='discarded' AND revision=?").bind(id, article.revision),
      env.DB.prepare(`DELETE FROM article_versions WHERE article_id=? AND ${absent}`).bind(id, id),
      env.DB.prepare(`DELETE FROM import_jobs WHERE article_id=? AND ${absent}`).bind(id, id),
      env.DB.prepare(`DELETE FROM review_events WHERE article_id=? AND ${absent}`).bind(id, id),
      env.DB.prepare(`DELETE FROM article_clicks WHERE article_id=? AND ${absent}`).bind(id, id),
      env.DB.prepare(`DELETE FROM article_metrics_daily WHERE article_id=? AND ${absent}`).bind(id, id),
      env.DB.prepare(`DELETE FROM archive_ids WHERE article_id=? AND ${absent}`).bind(id, id),
    ]);
    if (results[0]?.meta?.changes !== 1) return json({ error:"revision_conflict" }, 409);
    const cleanupFailed = [];
    for (const key of exclusive) {
      try { await env.MEDIA.delete(key); } catch { cleanupFailed.push(key); }
    }
    return json({ archive_code:article.archive_code, media_deleted:exclusive.length - cleanupFailed.length, media_cleanup_failed:cleanupFailed });
  } catch { return json({ error:"shred_unavailable" }, 503); }
}
