import { json, database } from "../../../lib/articles.js";
import { reader } from "../../../lib/readers.js";

export async function onRequestGet({ request, env }) {
  const missing = database(env);
  if (missing) return missing;
  try {
    const user = await reader(request, env);
    const result = await env.DB.prepare(`SELECT id, source_url, source_name, author, published_at, format, category, rights,
      title, card_title, summary, cover_url, updated_at FROM articles WHERE status = 'published'
      ORDER BY COALESCE((SELECT MAX(created_at) FROM review_events WHERE article_id=articles.id AND action='approve'), created_at) DESC, id ASC ${user ? "" : "LIMIT 1"}`).all();
    return json({ articles:result.results || [], limited:!user });
  } catch { return json({ error:"articles_unavailable" }, 503); }
}
