import { json, database, mediaManifest, stripXProfileImages } from "../../../lib/articles.js";
import { reader } from "../../../lib/readers.js";
import { guestLimitEnabled } from "../../../lib/site-settings.js";

export async function onRequestGet({ request, env }) {
  const missing = database(env);
  if (missing) return missing;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[a-z0-9-]{1,120}$/.test(id)) return json({ error:"invalid_id" }, 400);
  try {
    const user = await reader(request, env);
    const article = await env.DB.prepare("SELECT * FROM articles WHERE id = ? AND status = 'published'").bind(id).first();
    if (!article) return json({ error:"not_found" }, 404);
    if (!user && await guestLimitEnabled(env.DB)) return json({ error:"registration_required" }, 403);
    article.body = stripXProfileImages(article.body, article.source_url);
    article.media_manifest = JSON.stringify(mediaManifest(article.body, article.cover_url, article.video_url));
    return json({ article });
  } catch { return json({ error:"article_unavailable" }, 503); }
}
