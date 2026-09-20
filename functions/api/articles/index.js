import { json, database } from "../../../lib/articles.js";
import { reader } from "../../../lib/readers.js";
import { guestLimitEnabled } from "../../../lib/site-settings.js";

export async function onRequestGet({ request, env }) {
  const missing = database(env);
  if (missing) return missing;
  try {
    const user = await reader(request, env);
    const result = await env.DB.prepare(`SELECT id, source_url, source_name, author, published_at, format, category, rights,
      title, card_title, summary, cover_url, updated_at FROM articles WHERE status = 'published'
      ORDER BY COALESCE((SELECT MAX(created_at) FROM review_events WHERE article_id=articles.id AND action='approve'), created_at) DESC, id ASC`).all();
    const articles = result.results || [];
    return json({ articles, limited:!user && await guestLimitEnabled(env.DB), free_article_id:articles[0]?.id || null });
  } catch { return json({ error:"articles_unavailable" }, 503); }
}
