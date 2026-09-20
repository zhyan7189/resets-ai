import { json, database, mediaManifest, stripXProfileImages } from "../../../lib/articles.js";
import { reader } from "../../../lib/readers.js";

export async function onRequestGet({ request, env }) {
  const missing = database(env);
  if (missing) return missing;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ error:"invalid_id" }, 400);
  try {
    const user = await reader(request, env);
    const article = await env.DB.prepare("SELECT * FROM articles WHERE id = ? AND status = 'published'").bind(id).first();
    if (!article) return json({ error:"not_found" }, 404);
    if (!user) {
      const allowed = await env.DB.prepare("SELECT id FROM articles WHERE status = 'published' ORDER BY COALESCE((SELECT MAX(created_at) FROM review_events WHERE article_id=articles.id AND action='approve'), created_at) DESC, id ASC LIMIT 1").all();
      if (!(allowed.results || []).some((row) => row.id === id)) return json({ error:"registration_required" }, 403);
    }
    article.body = stripXProfileImages(article.body, article.source_url);
    article.media_manifest = JSON.stringify(mediaManifest(article.body, article.cover_url, article.video_url));
    return json({ article });
  } catch { return json({ error:"article_unavailable" }, 503); }
}
