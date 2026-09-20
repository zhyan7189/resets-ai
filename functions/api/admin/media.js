import { authorized, database, json, mediaManifest } from "../../../lib/articles.js";

export async function onRequestGet({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  const missing = database(env);
  if (missing) return missing;
  try {
    const result = await env.DB.prepare("SELECT a.id, 'DA' || ai.number AS archive_code, a.title,a.body,a.cover_url,a.video_url,a.media_manifest FROM articles a LEFT JOIN archive_ids ai ON ai.article_id=a.id ORDER BY a.updated_at DESC").all();
    const media = [];
    for (const article of result.results || []) {
      try {
        const saved = JSON.parse(article.media_manifest || "[]");
        for (const item of saved.length ? saved : mediaManifest(article.body, article.cover_url, article.video_url)) media.push({ ...item, article_id:article.id, archive_code:article.archive_code, article_title:article.title, storage:String(item.url || "").startsWith("/api/media/") ? "R2" : "外部" });
      } catch { /* 旧记录的媒体清单为空时仍显示其他记录。 */ }
    }
    return json({ media });
  } catch { return json({ error:"media_unavailable" }, 503); }
}
